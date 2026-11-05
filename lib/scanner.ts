/**
 * Scan orchestration: photo -> (device engine | server engine) -> Sheet.
 *
 * Printed Scantron sheets (corner markers) are read on the phone - offline,
 * no upload. Calibrated institutional sheets (e.g. KNUST) and "auto" mode use
 * the server engine.
 */
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import jpeg from 'jpeg-js';

import { ApiError, serverScan } from './api';
import type { Exam, Sheet } from './models';
import { DeviceScanError, deviceSupports, scanGray } from './omr/engine';
import { INDEX_FIELD } from './omr/template';
import type { GrayImage, ScanReading } from './omr/types';
import { getSettings } from './settings';
import { SCANS_DIR, uid } from './store';

export class ScanError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

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

export function decodeJpegGray(b64: string): GrayImage {
  const raw = jpeg.decode(base64ToBytes(b64), { useTArray: true, formatAsRGBA: false, maxMemoryUsageInMB: 256 });
  const { width, height, data } = raw;
  const gray = new Uint8Array(width * height);
  for (let i = 0, j = 0; i < gray.length; i++, j += 3) {
    gray[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
  }
  return { width, height, data: gray };
}

/** Downscale + re-encode a photo; returns the new file and (optionally) its grayscale pixels. */
export async function preparePhoto(uri: string, width: number, withPixels: boolean, compress = 0.85) {
  const out = await ImageManipulator.manipulateAsync(uri, [{ resize: { width } }], {
    compress,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: withPixels,
  });
  return { uri: out.uri, width: out.width, height: out.height, gray: withPixels && out.base64 ? decodeJpegGray(out.base64) : null };
}

export function canGradeOnDevice(exam: Exam): boolean {
  return getSettings().engine !== 'server' && deviceSupports(exam.templateId);
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
    const p = await preparePhoto(uri, 1400, true, 0.88);
    try {
      const reading = scanGray(p.gray!, { templateId: exam.templateId });
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

/** Build a Sheet record from a reading (limited to the exam's question count). */
export function toSheet(exam: Exam, id: string, o: ScanOutcome): Sheet {
  const r = o.reading;
  const idField = r.fields[INDEX_FIELD];
  const answers = r.questions.filter((q) => Number(q.label) <= exam.numQuestions);
  const reviewQ = answers.filter((q) => q.flags.length).map((q) => q.label);
  const reasons: string[] = [];
  if (reviewQ.length) reasons.push(`${reviewQ.length} question(s) have unclear marks: ${reviewQ.slice(0, 8).join(', ')}${reviewQ.length > 8 ? '…' : ''}`);
  for (const f of Object.values(r.fields)) {
    if (!f.value || f.value.includes('?') || f.issues.length || f.confidence < 0.45) reasons.push(`${f.label} needs checking`);
  }
  return {
    id,
    examId: exam.id,
    createdAt: Date.now(),
    templateId: r.templateId,
    engine: r.engine,
    studentId: idField?.value ?? null,
    studentIdConfidence: idField?.confidence ?? 0,
    fields: Object.fromEntries(Object.entries(r.fields).map(([k, f]) => [k, { label: f.label, value: f.value, confidence: f.confidence }])),
    answers,
    overrides: {},
    reviewReasons: reasons,
    reviewed: false,
    warnings: r.warnings,
    photoUri: o.photoUri,
    annotatedUri: o.annotatedUri,
    regionUris: o.regionUris,
    homography: r.homography,
    imageSize: r.imageSize,
  };
}

export function newSheetId(): string {
  return uid('s_');
}
