/**
 * Marker-free sheet registration (e.g. KNUST sheets), fully on-device.
 *
 * 1. Paper outline: Otsu threshold of a small copy -> largest bright region ->
 *    convex hull -> quadrilateral -> initial homography (tries 0 and 180 deg).
 * 2. Lock onto the print: every template block is matched against the blank
 *    reference sheet with normalised cross-correlation, coarse (1/4 res) then
 *    fine (1/2 res). The block offsets are used to refit the homography, so
 *    the final alignment is set by hundreds of printed features, not by the
 *    paper edges.
 * 3. Residual per-block offsets absorb printing/paper drift.
 */
import { findHomography, project } from './homography';
import { convexHull, hullToQuad, polyArea } from './markers';
import type { CompiledTemplate, GrayImage, Pt } from './types';

export interface Registration {
  H: number[]; // template -> image
  shifts: Map<number, Pt>; // residual per-block offsets (template px)
  score: number; // mean NCC of matched blocks, 0..1
  matched: number;
  quad: Pt[];
}

// ----------------------------------------------------------------------------- paper outline

function downscale(img: GrayImage, maxSide: number): { img: GrayImage; s: number } {
  const s = Math.min(1, maxSide / Math.max(img.width, img.height));
  if (s === 1) return { img, s };
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const out = new Uint8Array(w * h);
  const red = img.red ? new Uint8Array(w * h) : undefined;
  const step = 1 / s;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // 2x2 box sample around the source location
      const sx = Math.min(img.width - 2, Math.floor(x * step));
      const sy = Math.min(img.height - 2, Math.floor(y * step));
      const i = sy * img.width + sx;
      out[y * w + x] = (img.data[i] + img.data[i + 1] + img.data[i + img.width] + img.data[i + img.width + 1]) >> 2;
      if (red) red[y * w + x] = (img.red![i] + img.red![i + 1] + img.red![i + img.width] + img.red![i + img.width + 1]) >> 2;
    }
  }
  return { img: { width: w, height: h, data: out, red }, s };
}

function otsu(data: Uint8Array): number {
  const hist = new Array(256).fill(0);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;
  const total = data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      thr = t;
    }
  }
  return thr;
}

/**
 * Remove smooth uneven lighting from the paper: fit a cubic surface to the
 * pixels Otsu calls paper, divide it out, and repeat. The background stays
 * darker than the (now evenly lit) paper, so one threshold separates them even
 * when part of the sheet is in shadow.
 */
function flattenLighting(src: Uint8Array, w: number, h: number): Uint8Array {
  const ORDER = 3;
  const terms: [number, number][] = [];
  for (let i = 0; i <= ORDER; i++) for (let j = 0; j <= ORDER - i; j++) terms.push([i, j]);
  const k = terms.length;
  const basis = (u: number, v: number, f: Float64Array) => {
    for (let t = 0; t < k; t++) f[t] = u ** terms[t][0] * v ** terms[t][1];
  };
  const f = new Float64Array(k);
  let cur = src;
  for (let iter = 0; iter < 3; iter++) {
    const thr = otsu(cur);
    const A = new Float64Array(k * k);
    const B = new Float64Array(k);
    let n = 0;
    for (let y = 0; y < h; y += 2)
      for (let x = 0; x < w; x += 2) {
        const i = y * w + x;
        if (cur[i] <= thr) continue;
        basis((2 * x) / w - 1, (2 * y) / h - 1, f);
        for (let r = 0; r < k; r++) {
          B[r] += f[r] * src[i];
          for (let c = 0; c < k; c++) A[r * k + c] += f[r] * f[c];
        }
        n++;
      }
    if (n < 100) return cur;
    const coef = solveLinear(A, B, k);
    if (!coef) return cur;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        basis((2 * x) / w - 1, (2 * y) / h - 1, f);
        let surf = 0;
        for (let t = 0; t < k; t++) surf += coef[t] * f[t];
        const i = y * w + x;
        out[i] = Math.max(0, Math.min(255, Math.round((src[i] * 200) / Math.max(30, surf))));
      }
    cur = out;
  }
  return cur;
}

/** Gaussian elimination with partial pivoting (n x n system, row-major A). */
function solveLinear(A: Float64Array, B: Float64Array, n: number): number[] | null {
  const M = Array.from({ length: n }, (_, r) => [...A.slice(r * n, r * n + n), B[r]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-9) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const m = M[r][c] / M[c][c];
      for (let j = c; j <= n; j++) M[r][j] -= m * M[c][j];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** red minus gray above which a pixel is a warm surface (wood), not white paper */
const WARM_LIMIT = 24;

/** Paper outline (TL, TR, BR, BL by position) in full-image px, or null. */
export function findPageQuad(full: GrayImage, flatten = false): Pt[] | null {
  const { img, s } = downscale(full, 420);
  const { width: w, height: h, red } = img;
  const data = flatten ? flattenLighting(img.data, w, h) : img.data;
  const thr = otsu(data);
  const mask = new Uint8Array(w * h);
  // Paper is bright and neutral. With colour available, also reject warm
  // surfaces (wooden desks) that are as bright as the paper.
  for (let i = 0; i < mask.length; i++) mask[i] = data[i] > thr && (!red || red[i] - img.data[i] < WARM_LIMIT) ? 1 : 0;
  // Close small dark gaps (print on the paper) with a 3x3 max filter, twice.
  for (let pass = 0; pass < 2; pass++) {
    const copy = mask.slice();
    for (let y = 1; y < h - 1; y++)
      for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (copy[i]) continue;
        if (copy[i - 1] && copy[i + 1]) mask[i] = 1;
        else if (copy[i - w] && copy[i + w]) mask[i] = 1;
      }
  }
  // Erode twice so speckled bright surfaces touching the paper detach from it.
  const ERODE = 2;
  for (let pass = 0; pass < ERODE; pass++) {
    const copy = mask.slice();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (!copy[i]) continue;
        if (x === 0 || y === 0 || x === w - 1 || y === h - 1) continue;
        if (!copy[i - 1] || !copy[i + 1] || !copy[i - w] || !copy[i + w]) mask[i] = 0;
      }
  }
  // Largest bright component.
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let bestCount = 0;
  let bestBoundary: number[] = [];
  let lab = 0;
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start]) continue;
    lab++;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = lab;
    let count = 0;
    const boundary: number[] = [];
    while (sp) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      count++;
      let edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (q < 0 || q >= w * h) continue;
        if (mask[q]) {
          if (!labels[q]) {
            labels[q] = lab;
            stack[sp++] = q;
          }
        } else edge = true;
      }
      if (edge) boundary.push(x, y);
    }
    if (count > bestCount) {
      bestCount = count;
      bestBoundary = boundary;
    }
  }
  if (bestCount < 0.12 * w * h) return null;
  const q0 = hullToQuad(convexHull(bestBoundary));
  if (!q0) return null;
  // Undo the erosion: push each corner outwards from the centre.
  const cx = q0.reduce((a, p) => a + p.x, 0) / 4;
  const cy = q0.reduce((a, p) => a + p.y, 0) / 4;
  const quad = q0.map((p) => {
    const d = Math.hypot(p.x - cx, p.y - cy) || 1;
    return { x: p.x + ((p.x - cx) / d) * ERODE * 1.41, y: p.y + ((p.y - cy) / d) * ERODE * 1.41 };
  });
  const area = Math.abs(polyArea(quad));
  if (area < 0.12 * w * h || area > 0.985 * w * h) return null;
  // Order by position: TL = min(x+y), BR = max(x+y), TR = min(y-x), BL = max(y-x).
  const sum = quad.map((p) => p.x + p.y);
  const diff = quad.map((p) => p.y - p.x);
  const pick = (arr: number[], f: (a: number, b: number) => boolean) => quad[arr.reduce((bi, v, i) => (f(v, arr[bi]) ? i : bi), 0)];
  const ordered = [pick(sum, (a, b) => a < b), pick(diff, (a, b) => a < b), pick(sum, (a, b) => a > b), pick(diff, (a, b) => a > b)];
  return ordered.map((p) => ({ x: p.x / s, y: p.y / s }));
}

// ----------------------------------------------------------------------------- reference pyramid

interface Level {
  scale: number;
  ref: GrayImage;
}

const pyramids = new WeakMap<Uint8Array, Level[]>();

function boxHalf(img: GrayImage): GrayImage {
  const w = img.width >> 1;
  const h = img.height >> 1;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = 2 * y * img.width + 2 * x;
      out[y * w + x] = (img.data[i] + img.data[i + 1] + img.data[i + img.width] + img.data[i + img.width + 1]) >> 2;
    }
  return { width: w, height: h, data: out };
}

function referencePyramid(ref: GrayImage): Level[] {
  let p = pyramids.get(ref.data);
  if (!p) {
    const half = boxHalf(ref);
    p = [
      { scale: 0.25, ref: boxHalf(half) },
      { scale: 0.5, ref: half },
    ];
    pyramids.set(ref.data, p);
  }
  return p;
}

/**
 * Best NCC offset of template patch T (tw x th) inside region R ((tw+2p) x (th+2p)).
 * Zero-mean template + summed-area tables of R make each shift a single dot product.
 */
function nccSearch(T: Float32Array, tVar: number, tw: number, th: number, R: Float32Array, pad: number): { dx: number; dy: number; score: number } {
  const n = tw * th;
  if (tVar < 1e-6) return { dx: 0, dy: 0, score: 0 };
  const rw = tw + 2 * pad;
  const rh = th + 2 * pad;
  const sw = rw + 1;
  const S1 = new Float64Array(sw * (rh + 1));
  const S2 = new Float64Array(sw * (rh + 1));
  for (let y = 0; y < rh; y++) {
    let r1 = 0;
    let r2 = 0;
    for (let x = 0; x < rw; x++) {
      const v = R[y * rw + x];
      r1 += v;
      r2 += v * v;
      S1[(y + 1) * sw + x + 1] = S1[y * sw + x + 1] + r1;
      S2[(y + 1) * sw + x + 1] = S2[y * sw + x + 1] + r2;
    }
  }
  let best = -2;
  let bx = 0;
  let by = 0;
  for (let oy = 0; oy <= 2 * pad; oy++)
    for (let ox = 0; ox <= 2 * pad; ox++) {
      const a0 = oy * sw + ox;
      const a1 = oy * sw + ox + tw;
      const b0 = (oy + th) * sw + ox;
      const b1 = (oy + th) * sw + ox + tw;
      const sR = S1[b1] - S1[a1] - S1[b0] + S1[a0];
      const sRR = S2[b1] - S2[a1] - S2[b0] + S2[a0];
      const rVar = sRR - (sR * sR) / n;
      if (rVar < 1e-6) continue;
      let dot = 0;
      for (let y = 0; y < th; y++) {
        const ro = (y + oy) * rw + ox;
        const to = y * tw;
        for (let x = 0; x < tw; x++) dot += T[to + x] * R[ro + x];
      }
      const score = dot / Math.sqrt(tVar * rVar);
      if (score > best) {
        best = score;
        bx = ox - pad;
        by = oy - pad;
      }
    }
  return { dx: bx, dy: by, score: best };
}

interface Patch {
  T: Float32Array; // zero-mean reference patch
  tVar: number;
  tw: number;
  th: number;
  x0: number;
  y0: number;
}

const patchCache = new WeakMap<Uint8Array, Map<string, Patch | null>>();

function refPatch(level: Level, t: CompiledTemplate, bi: number): Patch | null {
  let cache = patchCache.get(level.ref.data);
  if (!cache) patchCache.set(level.ref.data, (cache = new Map()));
  const key = `${t.id}:${bi}`;
  if (cache.has(key)) return cache.get(key)!;
  const s = level.scale;
  const b = t.blocks[bi];
  const x0 = Math.floor((b.bbox[0] - 6) * s);
  const y0 = Math.floor((b.bbox[1] - 6) * s);
  const tw = Math.ceil((b.bbox[2] + 6) * s) - x0;
  const th = Math.ceil((b.bbox[3] + 6) * s) - y0;
  let patch: Patch | null = null;
  if (x0 >= 0 && y0 >= 0 && x0 + tw < level.ref.width && y0 + th < level.ref.height) {
    const T = new Float32Array(tw * th);
    let mean = 0;
    for (let y = 0; y < th; y++)
      for (let x = 0; x < tw; x++) {
        const v = level.ref.data[(y0 + y) * level.ref.width + x0 + x];
        T[y * tw + x] = v;
        mean += v;
      }
    mean /= tw * th;
    let tVar = 0;
    for (let i = 0; i < T.length; i++) {
      T[i] -= mean;
      tVar += T[i] * T[i];
    }
    patch = { T, tVar, tw, th, x0, y0 };
  }
  cache.set(key, patch);
  return patch;
}

/** Sample a rw x rh grid of template points (tx0 + i*step, ty0 + j*step) from the photo via H. */
function sampleGrid(img: GrayImage, H: number[], tx0: number, ty0: number, step: number, rw: number, rh: number): Float32Array {
  const out = new Float32Array(rw * rh);
  const { width: w, height: h, data } = img;
  const [a, b, c, d, e, f, g, hh, k] = H;
  for (let y = 0; y < rh; y++) {
    const ty = ty0 + y * step;
    // Homogeneous coordinates are linear along the row.
    let X = a * tx0 + b * ty + c;
    let Y = d * tx0 + e * ty + f;
    let Z = g * tx0 + hh * ty + k;
    const dX = a * step;
    const dY = d * step;
    const dZ = g * step;
    const row = y * rw;
    for (let x = 0; x < rw; x++) {
      const px = X / Z;
      const py = Y / Z;
      let v = 128;
      if (px >= 0 && py >= 0 && px < w - 1 && py < h - 1) {
        const x0 = px | 0;
        const y0 = py | 0;
        const fx = px - x0;
        const fy = py - y0;
        const i = y0 * w + x0;
        const top = data[i] + (data[i + 1] - data[i]) * fx;
        const bot = data[i + w] + (data[i + w + 1] - data[i + w]) * fx;
        v = top + (bot - top) * fy;
      }
      out[row + x] = v;
      X += dX;
      Y += dY;
      Z += dZ;
    }
  }
  return out;
}

function matchBlocks(img: GrayImage, t: CompiledTemplate, level: Level, H: number[], pad: number, shifts: Map<number, Pt>) {
  const s = level.scale;
  const out: { block: number; shift: Pt; score: number }[] = [];
  for (let bi = 0; bi < t.blocks.length; bi++) {
    const patch = refPatch(level, t, bi);
    if (!patch) continue;
    const base = shifts.get(bi) ?? { x: 0, y: 0 };
    const rw = patch.tw + 2 * pad;
    const rh = patch.th + 2 * pad;
    const R = sampleGrid(img, H, (patch.x0 - pad) / s + base.x, (patch.y0 - pad) / s + base.y, 1 / s, rw, rh);
    const m = nccSearch(patch.T, patch.tVar, patch.tw, patch.th, R, pad);
    out.push({ block: bi, shift: { x: base.x + m.dx / s, y: base.y + m.dy / s }, score: m.score });
  }
  return out;
}

function refit(t: CompiledTemplate, H: number[], matches: { block: number; shift: Pt; score: number }[]): number[] {
  const good = matches.filter((m) => m.score > 0.4);
  if (good.length < 4) return H;
  const src = good.map((m) => t.blocks[m.block].center);
  const dst = good.map((m) => project(H, t.blocks[m.block].center.x + m.shift.x, t.blocks[m.block].center.y + m.shift.y));
  const H2 = findHomography(src, dst);
  if (!H2) return H;
  // Reject outlier blocks (e.g. covered by a hand) and refit once.
  const err = good.map((m, i) => {
    const p = project(H2, src[i].x, src[i].y);
    return Math.hypot(p.x - dst[i].x, p.y - dst[i].y);
  });
  const sorted = [...err].sort((a, b) => a - b);
  const lim = Math.max(2, 3 * sorted[Math.floor(sorted.length / 2)]);
  const keep = good.filter((_, i) => err[i] <= lim);
  if (keep.length >= 4 && keep.length < good.length) {
    const H3 = findHomography(
      keep.map((m) => t.blocks[m.block].center),
      keep.map((m) => project(H, t.blocks[m.block].center.x + m.shift.x, t.blocks[m.block].center.y + m.shift.y)),
    );
    if (H3) return H3;
  }
  return H2;
}

/** Register a photo to a marker-free template using its blank reference image. */
export function registerToReference(img: GrayImage, t: CompiledTemplate, ref: GrayImage): Registration | null {
  // Candidate paper outlines, cheapest and most common first: plain threshold,
  // then with uneven lighting flattened (strong shadows), then the whole frame
  // (a flat scan, or the sheet filling the photo). Stop at the first confident one.
  const candidates: (() => Pt[] | null)[] = [
    () => findPageQuad(img),
    () => findPageQuad(img, true),
    () => [
      { x: 0, y: 0 },
      { x: img.width, y: 0 },
      { x: img.width, y: img.height },
      { x: 0, y: img.height },
    ],
  ];
  let best: Registration | null = null;
  for (const make of candidates) {
    const quad = make();
    if (!quad) continue;
    const r = registerFromQuad(img, t, ref, quad);
    if (r && (!best || r.score > best.score)) best = r;
    if (best && best.score > CONFIDENT_REGISTRATION) break;
  }
  return best;
}

/** block-match score above which a registration is accepted without trying other outlines */
const CONFIDENT_REGISTRATION = 0.5;

function registerFromQuad(img: GrayImage, t: CompiledTemplate, ref: GrayImage, quad: Pt[]): Registration | null {
  const pyr = referencePyramid(ref);
  const page = [
    { x: 0, y: 0 },
    { x: t.width, y: 0 },
    { x: t.width, y: t.height },
    { x: 0, y: t.height },
  ];
  const portraitTpl = t.height >= t.width;
  const wq = Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y);
  const hq = Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y);
  let q = quad;
  if (hq >= wq !== portraitTpl) q = [quad[1], quad[2], quad[3], quad[0]]; // rotate 90
  const candidates = [q, [q[2], q[3], q[0], q[1]]]; // 0 and 180 deg

  // Coarse pass (1/4 res, +-16 template px) for both orientations; keep the better one.
  let bestH: number[] | null = null;
  let bestCand = candidates[0];
  let bestCoarse = -1;
  for (const cand of candidates) {
    const H0 = findHomography(page, cand);
    if (!H0) continue;
    const m = matchBlocks(img, t, pyr[0], H0, 4, new Map());
    const sc = m.reduce((acc, x) => acc + Math.max(0, x.score), 0) / Math.max(1, m.length);
    if (sc > bestCoarse) {
      bestCoarse = sc;
      bestH = refit(t, H0, m);
      bestCand = cand;
    }
  }
  if (!bestH || bestCoarse < 0.2) return null;
  // Second coarse pass from the refit: blocks that were out of reach of the
  // paper-outline guess (curled or badly lit edges) are found now.
  bestH = refit(t, bestH, matchBlocks(img, t, pyr[0], bestH, 4, new Map()));
  // Fine pass (1/2 res, +-6 px), refit, then residual offsets (+-2 px).
  let H = refit(t, bestH, matchBlocks(img, t, pyr[1], bestH, 3, new Map()));
  const matches = matchBlocks(img, t, pyr[1], H, 1, new Map());
  const good = matches.filter((m) => m.score > 0.4);
  const score = good.length ? good.reduce((acc, m) => acc + m.score, 0) / matches.length : 0;
  const residual = new Map<number, Pt>();
  for (const m of good) residual.set(m.block, m.shift);
  const best: Registration = { H, shifts: residual, score, matched: good.length, quad: bestCand };
  return best.score > 0.35 ? best : null;
}
