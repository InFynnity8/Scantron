/**
 * On-device OMR engine for built-in (marker) sheets. Runs fully offline.
 *
 *   gray image -> ArUco markers -> template + homography -> fills -> decisions
 */
import { BUILTIN_TEMPLATES } from './generated';
import { findHomography, project } from './homography';
import { detectMarkers } from './markers';
import { composeCode, decide, measureFills, sheetStatistics } from './reader';
import { compileTemplate } from './template';
import type { CompiledTemplate, GrayImage, Pt, ScanReading, TemplateSpec } from './types';

export type DeviceScanErrorCode = 'no_sheet' | 'wrong_template' | 'too_small';

export class DeviceScanError extends Error {
  code: DeviceScanErrorCode;
  constructor(code: DeviceScanErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

const cache = new Map<string, CompiledTemplate>();

export function getTemplate(spec: TemplateSpec): CompiledTemplate {
  let t = cache.get(spec.id);
  if (!t || t.spec !== spec) {
    t = compileTemplate(spec);
    cache.set(spec.id, t);
  }
  return t;
}

export function builtinTemplates(): CompiledTemplate[] {
  return BUILTIN_TEMPLATES.map(getTemplate);
}

export function deviceSupports(templateId: string): boolean {
  return BUILTIN_TEMPLATES.some((t) => t.id === templateId);
}

export interface DeviceScanOptions {
  /** expected template; if omitted the template is identified from the markers */
  templateId?: string;
  templates?: CompiledTemplate[];
}

export function scanGray(img: GrayImage, opts: DeviceScanOptions = {}): ScanReading {
  const t0 = Date.now();
  const templates = opts.templates ?? builtinTemplates();
  const markers = detectMarkers(img);
  const ids = new Set(markers.map((m) => m.id));

  // Identify the template by its marker ids (>= 3 of 4 visible).
  let best: CompiledTemplate | null = null;
  let bestN = 0;
  for (const t of templates) {
    let n = 0;
    for (const id of t.markers.keys()) if (ids.has(id)) n++;
    if (n > bestN) {
      best = t;
      bestN = n;
    }
  }
  if (!best || bestN < 3) {
    throw new DeviceScanError('no_sheet', 'Point the camera at the sheet so all four corner squares are visible.');
  }
  if (opts.templateId && best.id !== opts.templateId) {
    throw new DeviceScanError('wrong_template', `This is a "${best.name}" sheet, not the one this exam uses.`);
  }
  const t = best;

  const src: Pt[] = [];
  const dst: Pt[] = [];
  for (const m of markers) {
    const tc = t.markers.get(m.id);
    if (!tc) continue;
    src.push(...tc);
    dst.push(...m.corners);
  }
  const H = findHomography(src, dst); // template -> image
  if (!H) throw new DeviceScanError('no_sheet', 'Could not line up the sheet. Hold the phone steady.');

  // Reprojection check guards against a mis-ordered marker.
  let err = 0;
  src.forEach((p, i) => {
    const q = project(H, p.x, p.y);
    err += Math.hypot(q.x - dst[i].x, q.y - dst[i].y);
  });
  err /= src.length;
  const a = project(H, 0, 0);
  const b = project(H, t.radius * 2, 0);
  const bubblePx = Math.hypot(b.x - a.x, b.y - a.y) / 2;
  if (err > Math.max(3, bubblePx * 0.6)) {
    throw new DeviceScanError('no_sheet', 'Sheet alignment is unstable. Hold the phone steady.');
  }
  if (bubblePx < 4) {
    throw new DeviceScanError('too_small', 'Move closer - the sheet is too small in the frame.');
  }

  const fieldItems = t.fields.flatMap((f) => f.columns);
  const items = [...t.questions, ...fieldItems];
  const fills = measureFills(img, H, items, t.radius);
  const stats = sheetStatistics(fills.flat());
  const readings = items.map((it, i) => decide(it, fills[i], stats));
  const questions = readings.slice(0, t.questions.length);
  const fields: ScanReading['fields'] = {};
  let k = t.questions.length;
  const reasons: string[] = [];
  for (const f of t.fields) {
    const cols = readings.slice(k, k + f.columns.length);
    k += f.columns.length;
    const fr = composeCode(f.label, cols, f.allowTrailingBlank);
    fields[f.name] = fr;
    if (!fr.value || fr.value.includes('?') || fr.issues.length || fr.confidence < 0.45) {
      reasons.push(`${f.label} could not be read with confidence`);
    }
  }
  const reviewQ = questions.filter((q) => q.flags.length).map((q) => q.label);
  if (reviewQ.length) reasons.unshift(`${reviewQ.length} question(s) have unclear marks`);
  const warnings: string[] = [];
  if (bubblePx < 6) warnings.push('Sheet is small in the photo - move closer for best accuracy.');

  return {
    templateId: t.id,
    engine: 'device',
    questions,
    fields,
    review: { needed: reasons.length > 0, questions: reviewQ, reasons },
    warnings,
    stats,
    homography: H,
    imageSize: { width: img.width, height: img.height },
    timingMs: Date.now() - t0,
  };
}
