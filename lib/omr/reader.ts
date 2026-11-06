/**
 * Bubble reading - TypeScript port of backend/scantron_omr/reader.py.
 * Keep the constants in sync with the Python engine.
 */
import { project } from './homography';
import type { FieldReading, GrayImage, Item, ItemReading, Pt, SheetStats, Status } from './types';

export const MIN_MARK_DELTA = 0.16;
export const MIN_JUMP = 0.14;
export const DEFAULT_DELTA = 0.32;
export const CONF_SCALE = 0.14;
export const REVIEW_CONFIDENCE = 0.45;
export const MARK_LEVEL_RATIO = 0.45;
/** code columns: a lone, clearly darker cell this far above baseline is a faint mark */
export const FAINT_DELTA = 0.1;
/** blank item whose darkest cell stands out this much is sent for review */
export const POSSIBLE_MARK_GAP = 0.09;

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

function sample(img: GrayImage, x: number, y: number, data: Uint8Array = img.data): number {
  const { width: w, height: h } = img;
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

/**
 * Fill score for every bubble: blend of trimmed mean and 35th percentile of ink.
 * Samples an ellipse (rx, ry) so elongated "<A>" cells work; `ink` selects the
 * channel (red removes red drop-out print); `shifts` are per-block offsets.
 */
export function measureFills(
  img: GrayImage,
  H: number[],
  items: Item[],
  rx: number,
  ry: number = rx,
  ink: Uint8Array = img.data,
  shifts?: Map<number, Pt>,
): number[][] {
  return items.map((it) =>
    it.centers.map((c0) => {
      const s = shifts?.get(it.block);
      const c = s ? { x: c0.x + s.x, y: c0.y + s.y } : c0;
      const ring: number[] = [];
      for (const [dx, dy] of RING) {
        const p = project(H, c.x + dx * rx, c.y + dy * ry);
        ring.push(sample(img, p.x, p.y, ink));
      }
      ring.sort((a, b) => a - b);
      const paper = Math.max(1, percentile(ring, 0.85));
      const vals: number[] = [];
      for (const [dx, dy] of DISK) {
        const p = project(H, c.x + dx * rx, c.y + dy * ry);
        const v = sample(img, p.x, p.y, ink);
        vals.push(Math.min(1, Math.max(0, 1 - v / paper)) / 0.85);
      }
      vals.sort((a, b) => a - b);
      const p95 = percentile(vals, 0.95);
      const trimmed = vals.filter((v) => v <= p95);
      const mean = trimmed.reduce((acc, v) => acc + v, 0) / Math.max(1, trimmed.length);
      return 0.5 * mean + 0.5 * percentile(vals, 0.35);
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
  if (jump === 0) {
    // No single clean gap (low-contrast print such as "<A>" cells, light
    // pencil): split empty/filled by Otsu, if the two classes are distinct.
    const split = otsuSplit(v);
    if (split !== null) thr = split;
  }
  return { baseline, floor, global_threshold: Math.max(thr, floor), jump };
}

/** Two-class split of sorted fills maximising between-class variance (port of reader._otsu_split). */
function otsuSplit(v: number[]): number | null {
  const n = v.length;
  if (n < 4) return null;
  const total = v.reduce((a, b) => a + b, 0);
  let c = 0;
  let best = -1;
  let bi = -1;
  let bm0 = 0;
  let bm1 = 0;
  for (let k = 1; k < n; k++) {
    c += v[k - 1];
    const m0 = c / k;
    const m1 = (total - c) / (n - k);
    const score = k * (n - k) * (m1 - m0) ** 2;
    if (score > best) {
      best = score;
      bi = k - 1;
      bm0 = m0;
      bm1 = m1;
    }
  }
  if (bm1 - bm0 < MIN_JUMP * 1.5) return null;
  return (v[bi] + v[bi + 1]) / 2;
}

/** Read one item. `codeColumn` (index number, course code...) also accepts a single faint but clearly darker cell, flagged "faint". */
export function decide(item: Item, fills: number[], stats: SheetStats, codeColumn = false): ItemReading {
  let thr = stats.global_threshold;
  let floor = stats.floor;
  let faint = false;
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
    else if (codeColumn && k === order.length - 2 && best >= MIN_JUMP && order[k + 1] >= stats.baseline + FAINT_DELTA) {
      thr = (order[k] + order[k + 1]) / 2;
      floor = stats.baseline + FAINT_DELTA;
      faint = true;
    }
  }
  thr = Math.max(thr, floor);

  const marked = item.options.filter((_, i) => fills[i] >= thr);
  const status: Status = marked.length === 0 ? 'blank' : marked.length === 1 ? 'answered' : 'multiple';
  const margin = Math.min(...fills.map((f) => Math.abs(f - thr)));
  let confidence = Math.min(1, Math.max(0, margin / CONF_SCALE));
  if (codeColumn && status === 'answered' && !faint && fills.length > 1) {
    // A code column has one mark among many printed cells: what matters is how far
    // the mark stands out from the next darkest cell (see reader.py).
    const top = [...fills].sort((x, y) => y - x);
    confidence = Math.min(1, Math.max(0, (top[0] - top[1]) / (2 * CONF_SCALE)));
  }
  const flags: string[] = [];
  if (confidence < REVIEW_CONFIDENCE) flags.push('ambiguous');
  if (fills.some((f) => f < thr && f >= stats.floor)) flags.push('possible_erasure');
  if (status === 'multiple') flags.push('multiple_marks');
  if (faint && status === 'answered') flags.push('faint');
  if (status === 'blank' && fills.length > 1) {
    const top = [...fills].sort((a, b) => b - a);
    // Read as blank, but one cell stands out: a light or off-centre mark. Review it.
    if (top[0] - top[1] >= POSSIBLE_MARK_GAP && top[0] >= stats.baseline + FAINT_DELTA) flags.push('possible_mark');
  }
  return { label: item.label, marked, status, confidence, fills, flags };
}

export function composeCode(label: string, cols: ItemReading[], allowTrailingBlank = true, optional: boolean[] = []): FieldReading {
  let n = cols.length;
  if (allowTrailingBlank) while (n > 0 && cols[n - 1].status === 'blank' && !cols[n - 1].flags.length) n--;
  let used = cols.slice(0, n);
  used = used.filter((c, i) => !(optional[i] && c.status === 'blank' && !c.flags.length));
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
