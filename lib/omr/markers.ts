/**
 * ArUco (DICT_4X4) marker detection in plain TypeScript.
 *
 * Pipeline: local-mean adaptive threshold (integral image) -> connected
 * components of dark pixels -> convex hull -> quadrilateral -> sample the 6x6
 * cell grid through a homography -> match against the known bit patterns in
 * all four corner orders (gives the marker's true orientation).
 */
import { ARUCO_4X4 } from './generated';
import { findHomography, project } from './homography';
import type { GrayImage, Pt } from './types';

export interface DetectedMarker {
  id: number;
  corners: Pt[]; // TL, TR, BR, BL in the marker's own orientation (image px)
}

function integral(img: GrayImage): Float64Array {
  const { width: w, height: h, data } = img;
  const ii = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += data[y * w + x];
      ii[(y + 1) * (w + 1) + x + 1] = ii[y * (w + 1) + x + 1] + row;
    }
  }
  return ii;
}

/** Binary mask: 1 where the pixel is clearly darker than its neighbourhood. */
export function darkMask(img: GrayImage, win: number, ratio = 0.78): Uint8Array {
  const { width: w, height: h, data } = img;
  const ii = integral(img);
  const r = Math.max(4, Math.floor(win / 2));
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(w, x + r + 1);
      const sum = ii[y1 * (w + 1) + x1] - ii[y0 * (w + 1) + x1] - ii[y1 * (w + 1) + x0] + ii[y0 * (w + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      out[y * w + x] = data[y * w + x] < mean * ratio ? 1 : 0;
    }
  }
  return out;
}

interface Component {
  count: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  boundary: number[]; // flattened x,y of boundary pixels
}

function components(mask: Uint8Array, w: number, h: number, minSide: number, maxSide: number): Component[] {
  const labels = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  const out: Component[] = [];
  let next = 1;
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || labels[start]) continue;
    const lab = next++;
    let sp = 0;
    stack[sp++] = start;
    labels[start] = lab;
    let count = 0;
    let minX = w;
    let minY = h;
    let maxX = 0;
    let maxY = 0;
    const boundary: number[] = [];
    let tooBig = false;
    while (sp > 0) {
      const p = stack[--sp];
      const x = p % w;
      const y = (p - x) / w;
      count++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (maxX - minX > maxSide || maxY - minY > maxSide) tooBig = true;
      let edge = false;
      // 4-neighbours
      if (x > 0) {
        const q = p - 1;
        if (mask[q]) {
          if (!labels[q]) {
            labels[q] = lab;
            stack[sp++] = q;
          }
        } else edge = true;
      } else edge = true;
      if (x < w - 1) {
        const q = p + 1;
        if (mask[q]) {
          if (!labels[q]) {
            labels[q] = lab;
            stack[sp++] = q;
          }
        } else edge = true;
      } else edge = true;
      if (y > 0) {
        const q = p - w;
        if (mask[q]) {
          if (!labels[q]) {
            labels[q] = lab;
            stack[sp++] = q;
          }
        } else edge = true;
      } else edge = true;
      if (y < h - 1) {
        const q = p + w;
        if (mask[q]) {
          if (!labels[q]) {
            labels[q] = lab;
            stack[sp++] = q;
          }
        } else edge = true;
      } else edge = true;
      if (edge && !tooBig) boundary.push(x, y);
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (tooBig || bw < minSide || bh < minSide) continue;
    if (bw > 3 * bh || bh > 3 * bw) continue;
    if (count < 0.3 * bw * bh) continue;
    out.push({ count, minX, minY, maxX, maxY, boundary });
  }
  return out;
}

function convexHull(flat: number[]): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < flat.length; i += 2) pts.push({ x: flat[i], y: flat[i + 1] });
  pts.sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function polyArea(q: Pt[]): number {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i];
    const n = q[(i + 1) % q.length];
    a += p.x * n.y - n.x * p.y;
  }
  return a / 2;
}

/** Largest-area quadrilateral approximation of a convex hull. */
function hullToQuad(hull: Pt[]): Pt[] | null {
  const n = hull.length;
  if (n < 4) return null;
  // Diagonal 1: farthest pair.
  let a = 0;
  let b = 0;
  let best = -1;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++) {
      const d = (hull[i].x - hull[j].x) ** 2 + (hull[i].y - hull[j].y) ** 2;
      if (d > best) {
        best = d;
        a = i;
        b = j;
      }
    }
  const A = hull[a];
  const B = hull[b];
  const side = (p: Pt) => (B.x - A.x) * (p.y - A.y) - (B.y - A.y) * (p.x - A.x);
  let c = -1;
  let d = -1;
  let maxPos = 0;
  let maxNeg = 0;
  for (let i = 0; i < n; i++) {
    const s = side(hull[i]);
    if (s > maxPos) {
      maxPos = s;
      c = i;
    }
    if (s < maxNeg) {
      maxNeg = s;
      d = i;
    }
  }
  if (c < 0 || d < 0) return null;
  const quad = [A, hull[c], B, hull[d]];
  // Clockwise in image coordinates (y down) => positive shoelace area.
  if (polyArea(quad) < 0) quad.reverse();
  return quad;
}

function bilinear(img: GrayImage, x: number, y: number): number {
  const { width: w, height: h, data } = img;
  if (x < 0 || y < 0 || x >= w - 1 || y >= h - 1) return 255;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const i = y0 * w + x0;
  return (
    data[i] * (1 - fx) * (1 - fy) + data[i + 1] * fx * (1 - fy) + data[i + w] * (1 - fx) * fy + data[i + w + 1] * fx * fy
  );
}

const CELL_OFFS = [0.3, 0.5, 0.7];

function readCells(img: GrayImage, quad: Pt[]): number[] | null {
  const H = findHomography(
    [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 6 },
      { x: 0, y: 6 },
    ],
    quad,
  );
  if (!H) return null;
  const cells: number[] = [];
  for (let r = 0; r < 6; r++)
    for (let c = 0; c < 6; c++) {
      let s = 0;
      for (const dy of CELL_OFFS)
        for (const dx of CELL_OFFS) {
          const p = project(H, c + dx, r + dy);
          s += bilinear(img, p.x, p.y);
        }
      cells.push(s / 9);
    }
  return cells;
}

const DICT: { id: number; bits: string }[] = Object.entries(ARUCO_4X4).map(([id, bits]) => ({ id: Number(id), bits }));

function decode(img: GrayImage, quad: Pt[]): DetectedMarker | null {
  const cells = readCells(img, quad);
  if (!cells) return null;
  const lo = Math.min(...cells);
  const hi = Math.max(...cells);
  if (hi - lo < 25) return null;
  const thr = (lo + hi) / 2;
  const bit = cells.map((v) => (v > thr ? '1' : '0'));
  // Border must be black.
  let borderWhite = 0;
  for (let i = 0; i < 6; i++) {
    for (const idx of [i, 30 + i, i * 6, i * 6 + 5]) if (bit[idx] === '1') borderWhite++;
  }
  if (borderWhite > 1) return null;
  const inner = (rot: number) => {
    // Read the 4x4 interior as if the corner order were rotated by `rot`.
    let s = '';
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        let rr = r;
        let cc = c;
        for (let k = 0; k < rot; k++) {
          const t = rr;
          rr = 3 - cc;
          cc = t;
        }
        s += bit[(rr + 1) * 6 + cc + 1];
      }
    return s;
  };
  for (let rot = 0; rot < 4; rot++) {
    const s = inner(rot);
    for (const { id, bits } of DICT) {
      if (s === bits) {
        // Corner `rot` of the sampled quad is the marker's TL... resolved empirically by `orderFor`.
        return { id, corners: orderFor(quad, rot) };
      }
    }
  }
  return null;
}

/** Re-order quad corners so index 0 is the marker's own top-left. */
function orderFor(quad: Pt[], rot: number): Pt[] {
  const k = (4 - rot) % 4;
  return [quad[k % 4], quad[(k + 1) % 4], quad[(k + 2) % 4], quad[(k + 3) % 4]];
}

export function detectMarkers(img: GrayImage): DetectedMarker[] {
  const minDim = Math.min(img.width, img.height);
  const mask = darkMask(img, Math.max(31, Math.round(minDim / 6)));
  const comps = components(mask, img.width, img.height, Math.max(8, minDim * 0.012), minDim * 0.3);
  const found = new Map<number, DetectedMarker>();
  for (const c of comps) {
    const hull = convexHull(c.boundary);
    const quad = hullToQuad(hull);
    if (!quad) continue;
    const area = polyArea(quad);
    if (area < 60 || c.count < 0.4 * area || c.count > 1.05 * area) continue;
    // Quad must be close to its hull (it's a square, not a blob).
    if (polyArea(hull) > 1.12 * area) continue;
    const m = decode(img, quad);
    if (m && !found.has(m.id)) found.set(m.id, m);
  }
  return [...found.values()];
}
