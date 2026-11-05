/**
 * Bubble reading - TypeScript port of backend/scantron_omr/reader.py.
 * Keep the constants in sync with the Python engine.
 */
import { project } from './homography';
import type { FieldReading, GrayImage, Item, ItemReading, SheetStats, Status } from './types';

export const MIN_MARK_DELTA = 0.16;
export const MIN_JUMP = 0.14;
export const DEFAULT_DELTA = 0.32;
export const CONF_SCALE = 0.14;
export const REVIEW_CONFIDENCE = 0.45;
export const MARK_LEVEL_RATIO = 0.45;

// Sample pattern on the unit disk (inner fill) and an annulus (paper level).
const DISK: [number, number][] = [];
for (const [rad, n] of [
  [0, 1],
  [0.22, 6],
  [0.4, 10],
  [0.55, 14],
  [0.68, 18],
] as const) {
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n + rad;
    DISK.push([rad * Math.cos(a), rad * Math.sin(a)]);
  }
}
const RING: [number, number][] = [];
for (const rad of [1.22, 1.38]) {
  for (let i = 0; i < 16; i++) {
    const a = (2 * Math.PI * i) / 16 + rad;
    RING.push([rad * Math.cos(a), rad * Math.sin(a)]);
  }
}

function sample(img: GrayImage, x: number, y: number): number {
  const { width: w, height: h, data } = img;
  if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 255;
  const x0 = x | 0;
  const y0 = y | 0;
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * w + x0;
  return data[i] * (1 - fx) * (1 - fy) + data[i + 1] * fx * (1 - fy) + data[i + w] * (1 - fx) * fy + data[i + w + 1] * fx * fy;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Fill score for every bubble: blend of trimmed mean and 35th percentile of ink. */
export function measureFills(img: GrayImage, H: number[], items: Item[], radius: number): number[][] {
  return items.map((it) =>
    it.centers.map((c) => {
      const ring: number[] = [];
      for (const [dx, dy] of RING) {
        const p = project(H, c.x + dx * radius, c.y + dy * radius);
        ring.push(sample(img, p.x, p.y));
      }
      ring.sort((a, b) => a - b);
      const paper = Math.max(1, percentile(ring, 0.85));
      const ink: number[] = [];
      for (const [dx, dy] of DISK) {
        const p = project(H, c.x + dx * radius, c.y + dy * radius);
        const v = sample(img, p.x, p.y);
        ink.push(Math.min(1, Math.max(0, 1 - v / paper)) / 0.85);
      }
      ink.sort((a, b) => a - b);
      const p95 = percentile(ink, 0.95);
      const trimmed = ink.filter((v) => v <= p95);
      const mean = trimmed.reduce((s, v) => s + v, 0) / Math.max(1, trimmed.length);
      return 0.5 * mean + 0.5 * percentile(ink, 0.35);
    }),
  );
}

export function sheetStatistics(all: number[]): SheetStats {
  const v = [...all].sort((a, b) => a - b);
  const baseline = v.length ? percentile(v, 0.5) : 0;
  const floor = baseline + MIN_MARK_DELTA;
  let thr = baseline + DEFAULT_DELTA;
  let jump = 0;
  // Lowest clear gap above the empty baseline (pencil and pen both count as
  // filled). The upper side must look like a real mark, not a lone smudge.
  const above = v.filter((x) => x >= floor);
  const minUpper = above.length ? Math.max(floor, MARK_LEVEL_RATIO * percentile(above, 0.5)) : floor;
  for (let i = 0; i + 1 < v.length; i++) {
    const g = v[i + 1] - v[i];
    if (v[i + 1] >= minUpper && g >= MIN_JUMP) {
      thr = (v[i] + v[i + 1]) / 2;
      jump = g;
      break;
    }
  }
  return { baseline, floor, global_threshold: Math.max(thr, floor), jump };
}

export function decide(item: Item, fills: number[], stats: SheetStats): ItemReading {
  let thr = stats.global_threshold;
  if (!fills.some((f) => f >= thr)) {
    // No clear mark by sheet standards: look for a faint but deliberate one.
    const order = [...fills].sort((a, b) => a - b);
    let best = 0;
    let k = -1;
    for (let i = 0; i + 1 < order.length; i++) {
      const g = order[i + 1] - order[i];
      if (g > best) {
        best = g;
        k = i;
      }
    }
    if (k >= 0 && best >= MIN_JUMP && order[k + 1] >= stats.floor) thr = (order[k] + order[k + 1]) / 2;
  }
  thr = Math.max(thr, stats.floor);

  const marked = item.options.filter((_, i) => fills[i] >= thr);
  const status: Status = marked.length === 0 ? 'blank' : marked.length === 1 ? 'answered' : 'multiple';
  const margin = Math.min(...fills.map((f) => Math.abs(f - thr)));
  const confidence = Math.min(1, Math.max(0, margin / CONF_SCALE));
  const flags: string[] = [];
  if (confidence < REVIEW_CONFIDENCE) flags.push('ambiguous');
  if (fills.some((f) => f < thr && f >= stats.floor)) flags.push('possible_erasure');
  if (status === 'multiple') flags.push('multiple_marks');
  return { label: item.label, marked, status, confidence, fills, flags };
}

export function composeCode(label: string, cols: ItemReading[], allowTrailingBlank = true): FieldReading {
  let n = cols.length;
  if (allowTrailingBlank) while (n > 0 && cols[n - 1].status === 'blank' && !cols[n - 1].flags.length) n--;
  const used = cols.slice(0, n);
  const issues: string[] = [];
  const chars = used.map((c) => {
    if (c.status === 'answered') {
      if (c.flags.length) issues.push(`position ${c.label}: unclear mark`);
      return c.marked[0];
    }
    issues.push(`position ${c.label}: ${c.status === 'blank' ? 'no mark' : 'several marks'}`);
    return '?';
  });
  const value = chars.join('') || null;
  let confidence = used.length ? Math.min(...used.map((c) => c.confidence)) : 0;
  if (!value || value.includes('?')) confidence = Math.min(confidence, 0.3);
  return { label, value, confidence, issues, characters: cols };
}
