import jpeg from 'jpeg-js';

import type { GrayImage } from './omr/types';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(256);
for (let i = 0; i < B64.length; i++) LOOKUP[B64.charCodeAt(i)] = i;

export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const len = clean.length;
  const out = new Uint8Array(Math.floor((len * 3) / 4));
  let p = 0;
  for (let i = 0; i < len; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)];
    const b = LOOKUP[clean.charCodeAt(i + 1)];
    const c = LOOKUP[clean.charCodeAt(i + 2)];
    const d = LOOKUP[clean.charCodeAt(i + 3)];
    out[p++] = (a << 2) | (b >> 4);
    if (i + 2 < len) out[p++] = ((b & 15) << 4) | (c >> 2);
    if (i + 3 < len) out[p++] = ((c & 3) << 6) | d;
  }
  return out.subarray(0, p);
}

/** Decode a base64 JPEG to luma (+ red channel for red drop-out sheets). */
export function decodeJpeg(b64: string, withRed = true): GrayImage {
  const raw = jpeg.decode(base64ToBytes(b64), { useTArray: true, formatAsRGBA: false, maxMemoryUsageInMB: 256 });
  const { width, height, data } = raw;
  const n = width * height;
  const gray = new Uint8Array(n);
  const red = withRed ? new Uint8Array(n) : undefined;
  for (let i = 0, j = 0; i < n; i++, j += 3) {
    gray[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    if (red) red[i] = data[j];
  }
  return { width, height, data: gray, red };
}
