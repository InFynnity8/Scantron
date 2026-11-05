/**
 * Scan orchestration: photo -> (device engine | server engine) -> Sheet.
 *
 * Printed Scantron sheets (corner markers) and downloaded institutional
 * templates (e.g. KNUST) are read on the phone - offline, no upload. "auto"
 * mode and not-yet-downloaded templates use the server engine.
 */
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

import { ApiError, serverScan } from './api';
import type { Exam, Sheet } from './models';
import { decodeJpeg } from './jpeg';
import { DeviceScanError, deviceSupports, scanGray, type DeviceScanOptions } from './omr/engine';
import { isCached, loadCustomTemplate } from './templateCache';
import { INDEX_FIELD } from './omr/template';
import type { ScanReading } from './omr/types';
import { getSettings } from './settings';
import { SCANS_DIR, uid } from './store';

export class ScanError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** Downscale + re-encode a photo; returns the new file and (optionally) its grayscale pixels. */
export async function preparePhoto(uri: string, width: number, withPixels: boolean, compress = 0.85) {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width } }], {
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: withPixels,
  });
  return { uri: out.uri, width: out.width, height: out.height, gray: withPixels && out.base64 ? decodeJpeg(out.base64) : null };
}

export function canGradeOnDevice(exam: Exam): boolean {
  return getSettings().engine !== 'server' && (deviceSupports(exam.templateId) || isCached(exam.templateId));
}

/** Options for the device engine (loads cached marker-free templates). */
export async function deviceOptions(exam: Exam): Promise<DeviceScanOptions> {
  if (deviceSupports(exam.templateId)) return { templateId: exam.templateId };
  const custom = await loadCustomTemplate(exam.templateId);
  if (!custom) throw new ScanError('not_downloaded', 'This sheet type has not been downloaded for offline use yet.');
  return { templateId: exam.templateId, custom };
}

export interface ScanOutcome {
  reading: ScanReading;
  photoUri: string;
  annotatedUri?: string;
  regionUris?: Record<string, { label: string; uri: string }>;
}

async function persist(examId: string, sheetId: string, src: string, suffix = 'photo'): Promise<string> {
  const dir = `${SCANS_DIR}${examId}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const dest = `${dir}${sheetId}-${suffix}.jpg`;
  await FileSystem.copyAsync({ from: src, to: dest });
  return dest;
}

async function writeDataUrl(examId: string, name: string, dataUrl: string): Promise<string> {
  const dir = `${SCANS_DIR}${examId}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const dest = `${dir}${name}.jpg`;
  await FileSystem.writeAsStringAsync(dest, dataUrl.split(',')[1], { encoding: FileSystem.EncodingType.Base64 });
  return dest;
}

/** Run a full-quality scan of one photo for an exam. */
export async function scanPhoto(exam: Exam, uri: string, sheetId: string): Promise<ScanOutcome> {
  if (canGradeOnDevice(exam)) {
    const opts = await deviceOptions(exam);
    const p = await preparePhoto(uri, opts.custom ? 1600 : 1400, true, 0.88);
    try {
      const reading = scanGray(p.gray!, opts);
      return { reading, photoUri: await persist(exam.id, sheetId, p.uri) };
    } catch (e) {
      if (e instanceof DeviceScanError) throw new ScanError(e.code, e.message);
      throw e;
    }
  }

  const p = await preparePhoto(uri, 2000, false, 0.85);
  const builtin = deviceSupports(exam.templateId);
  let res;
  try {
    res = await serverScan(p.uri, builtin ? 'detect' : exam.templateId);
  } catch (e) {
    if (e instanceof ApiError) throw new ScanError(e.code, e.message);
    throw e;
  }
  if (builtin && res.template.id !== exam.templateId) {
    throw new ScanError('wrong_template', `This is a "${res.template.name}" sheet, not the one this exam uses.`);
  }
  const reading: ScanReading = {
    templateId: res.template.id,
    engine: 'server',
    questions: res.questions.map((q) => ({
      label: q.label,
      marked: q.marked,
      status: q.status,
      confidence: q.confidence,
      fills: q.fills,
      flags: q.flags,
    })),
    fields: Object.fromEntries(
      Object.entries(res.fields).map(([k, f]) => [
        k,
        { label: f.label, value: f.value, confidence: f.confidence, issues: f.issues, characters: f.characters },
      ]),
    ),
    review: res.review,
    warnings: res.warnings,
    timingMs: res.timing_ms.total,
  };
  const photoUri = await persist(exam.id, sheetId, p.uri);
  const annotatedUri = res.images?.annotated ? await writeDataUrl(exam.id, `${sheetId}-annotated`, res.images.annotated) : undefined;
  const regionUris: Record<string, { label: string; uri: string }> = {};
  for (const [name, r] of Object.entries(res.images?.regions ?? {})) {
    regionUris[name] = { label: r.label, uri: await writeDataUrl(exam.id, `${sheetId}-${name}`, r.image) };
  }
  return { reading, photoUri, annotatedUri, regionUris };
}

/** A field needs checking when it has unreadable positions. An empty field is fine (optional), except the index number. */
function fieldNeedsReview(f: { value: string | null; confidence: number; issues: string[] }, required = false): boolean {
  if (!f.value) return required;
  return f.value.includes('?') || f.issues.length > 0 || f.confidence < 0.45;
}

/** Build a Sheet record from a reading (limited to the exam's question count). */
export function toSheet(exam: Exam, id: string, o: ScanOutcome): Sheet {
  const r = o.reading;
  const idField = r.fields[INDEX_FIELD];
  const answers = r.questions.filter((q) => Number(q.label) <= exam.numQuestions);
  const reviewQ = answers.filter((q) => q.flags.length).map((q) => q.label);
  const reasons: string[] = [];
  if (reviewQ.length) reasons.push(`${reviewQ.length} question(s) have unclear marks: ${reviewQ.slice(0, 8).join(', ')}${reviewQ.length > 8 ? '…' : ''}`);
  for (const [k, f] of Object.entries(r.fields)) {
    if (fieldNeedsReview(f, k === INDEX_FIELD)) reasons.push(`${f.label} needs checking`);
  }
  return {
    id,
    examId: exam.id,
    createdAt: Date.now(),
    templateId: r.templateId,
    engine: r.engine,
    studentId: idField?.value ?? null,
    studentIdConfidence: idField?.confidence ?? 0,
    fields: Object.fromEntries(
      Object.entries(r.fields).map(([k, f]) => [
        k,
        { label: f.label, value: f.value, confidence: f.confidence, marks: f.characters.map((c) => (c.status === 'answered' ? c.marked[0] : null)) },
      ]),
    ),
    answers,
    overrides: {},
    reviewReasons: reasons,
    reviewed: false,
    warnings: r.warnings,
    photoUri: o.photoUri,
    annotatedUri: o.annotatedUri,
    regionUris: o.regionUris,
    homography: r.homography,
    blockShifts: r.blockShifts,
    imageSize: r.imageSize,
  };
}

export function newSheetId(): string {
  return uid('s_');
}
