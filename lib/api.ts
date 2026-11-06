/** Network clients: auth service (Express) and OMR service (FastAPI). */
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TemplateSpec } from './omr/types';
import { getSettings, trimUrl } from './settings';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;
export function setAuthToken(t: string | null) {
  authToken = t;
}
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(url: string, init: RequestInit = {}, timeoutMs = 60000): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') throw new ApiError('timeout', 'The server took too long to respond. Check your connection and try again.');
    throw new ApiError('offline', 'Cannot reach the server. Check your internet connection.');
  } finally {
    clearTimeout(timer);
  }
  let body: any = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(body?.error ?? `http_${res.status}`, body?.message ?? `Request failed (${res.status}).`, res.status);
  }
  return body as T;
}

// ----------------------------------------------------------------------------- auth

export interface AuthUser {
  _id: string;
  username: string;
  email: string;
  token: string;
}

export function login(email: string, password: string): Promise<AuthUser> {
  return request<AuthUser>(
    `${trimUrl(getSettings().authUrl)}/api/login`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) },
    70000, // free-tier hosts can take a while to wake up
  );
}

export async function register(email: string, password: string): Promise<void> {
  await request(
    `${trimUrl(getSettings().authUrl)}/api/create-user`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) },
    70000,
  );
}

// ----------------------------------------------------------------------------- OMR

export interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  num_questions: number;
  options: string[];
  id_digits: number;
  fields: { name: string; label: string; length: number }[];
  alignment: string;
  printable: boolean;
}

const TEMPLATES_CACHE = 'scantron.templates.v1';

export async function fetchTemplates(): Promise<TemplateSummary[]> {
  try {
    const r = await request<{ templates: TemplateSummary[] }>(`${trimUrl(getSettings().omrUrl)}/v1/templates`, {}, 20000);
    await AsyncStorage.setItem(TEMPLATES_CACHE, JSON.stringify(r.templates));
    return r.templates;
  } catch (e) {
    const cached = await AsyncStorage.getItem(TEMPLATES_CACHE);
    if (cached) return JSON.parse(cached);
    throw e;
  }
}

export async function fetchTemplateSpec(id: string): Promise<TemplateSpec> {
  const r = await request<{ spec: TemplateSpec }>(`${trimUrl(getSettings().omrUrl)}/v1/templates/${encodeURIComponent(id)}`);
  return r.spec;
}

export function sheetPdfUrl(templateId: string, title?: string): string {
  const q = title ? `&title=${encodeURIComponent(title)}` : '';
  return `${trimUrl(getSettings().omrUrl)}/v1/templates/${encodeURIComponent(templateId)}/sheet?format=pdf${q}`;
}

/** What a sheet type looks like: a printable sheet's preview, or the blank reference of an external sheet (e.g. KNUST). */
export function sheetPreviewUrl(templateId: string, printable: boolean): string {
  const base = `${trimUrl(getSettings().omrUrl)}/v1/templates/${encodeURIComponent(templateId)}`;
  return printable ? `${base}/sheet?format=jpg` : `${base}/reference.jpg`;
}

export async function health(url?: string): Promise<boolean> {
  try {
    const r = await request<{ status: string }>(`${trimUrl(url ?? getSettings().omrUrl)}/health`, {}, 60000);
    return r?.status === 'ok';
  } catch {
    return false;
  }
}

/** Raw server response (subset used by the app). */
export interface ServerScan {
  template: { id: string; name: string; options: string[] };
  student_id: { value: string | null; confidence: number; issues: string[] } | null;
  fields: Record<string, { label: string; value: string | null; confidence: number; issues: string[]; characters: any[] }>;
  questions: { label: string; marked: string[]; status: 'answered' | 'blank' | 'multiple'; confidence: number; fills: number[]; flags: string[] }[];
  review: { needed: boolean; questions: string[]; reasons: string[] };
  warnings: string[];
  images?: { annotated: string; regions: Record<string, { label: string; image: string }> };
  timing_ms: { total: number };
}

export async function serverScan(imageUri: string, template: string): Promise<ServerScan> {
  const form = new FormData();
  form.append('image', { uri: imageUri, name: 'sheet.jpg', type: 'image/jpeg' } as any);
  form.append('template', template);
  form.append('include_images', 'true');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  return request<ServerScan>(`${trimUrl(getSettings().omrUrl)}/v1/scan`, { method: 'POST', body: form, headers }, 90000);
}
