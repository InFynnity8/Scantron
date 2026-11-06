/**
 * Offline cache for server-side templates (e.g. calibrated KNUST sheets).
 *
 * The spec and the blank-sheet reference are downloaded once; afterwards the
 * on-device engine grades those sheets with no network at all.
 */
import * as FileSystem from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import { fetchTemplateSpec } from './api';
import { decodeJpeg } from './jpeg';
import { BUILTIN_TEMPLATES } from './omr/generated';
import { getTemplate } from './omr/engine';
import type { CompiledTemplate, GrayImage, TemplateSpec } from './omr/types';
import { getSettings, trimUrl } from './settings';

const DIR = `${FileSystem.documentDirectory}templates/`;
const cached = new Set<string>();
/** specs of downloaded templates, so their sheet type can be offered offline */
const specs = new Map<string, TemplateSpec>();
const loaded = new Map<string, { template: CompiledTemplate; reference: GrayImage }>();
const listeners = new Set<() => void>();
let version = 0;
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};

export function isBuiltin(id: string): boolean {
  return BUILTIN_TEMPLATES.some((t) => t.id === id);
}

/** Scan the cache folder (call once at start-up). */
export async function loadTemplateCache(): Promise<void> {
  await FileSystem.makeDirectoryAsync(DIR, { intermediates: true }).catch(() => undefined);
  const ids = await FileSystem.readDirectoryAsync(DIR).catch(() => [] as string[]);
  for (const id of ids) {
    const info = await FileSystem.getInfoAsync(`${DIR}${id}/reference.jpg`);
    if (info.exists) {
      cached.add(id);
      try {
        specs.set(id, JSON.parse(await FileSystem.readAsStringAsync(`${DIR}${id}/spec.json`)));
      } catch {
        // spec unreadable - re-downloaded on next use
      }
    }
  }
  bump();
}

export function isCached(id: string): boolean {
  return cached.has(id);
}

/** Downloaded (offline-ready) template specs. */
export function cachedSpecs(): TemplateSpec[] {
  return [...specs.values()];
}

/** Local file of a downloaded template's blank sheet (for previews offline). */
export function cachedReferenceUri(id: string): string | null {
  return cached.has(id) ? `${DIR}${id}/reference.jpg` : null;
}

/** Download spec + reference so the sheet can be graded offline. Returns false if not supported on-device. */
export async function downloadTemplate(id: string): Promise<boolean> {
  if (isBuiltin(id) || id === 'auto') return isBuiltin(id);
  const spec: TemplateSpec = await fetchTemplateSpec(id);
  if (spec.alignment.type === 'aruco') return false;
  const dir = `${DIR}${id}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  const url = `${trimUrl(getSettings().omrUrl)}/v1/templates/${encodeURIComponent(id)}/reference.jpg`;
  const tmp = `${dir}reference.part`;
  const res = await FileSystem.downloadAsync(url, tmp);
  if (res.status !== 200) throw new Error(`Reference download failed (${res.status}).`);
  await FileSystem.writeAsStringAsync(`${dir}spec.json`, JSON.stringify(spec));
  await FileSystem.moveAsync({ from: tmp, to: `${dir}reference.jpg` });
  loaded.delete(id);
  cached.add(id);
  specs.set(id, spec);
  bump();
  return true;
}

/** Load a cached marker-free template (memoised). */
export async function loadCustomTemplate(id: string): Promise<{ template: CompiledTemplate; reference: GrayImage } | null> {
  if (loaded.has(id)) return loaded.get(id)!;
  if (!cached.has(id)) return null;
  const dir = `${DIR}${id}/`;
  const spec: TemplateSpec = JSON.parse(await FileSystem.readAsStringAsync(`${dir}spec.json`));
  const b64 = await FileSystem.readAsStringAsync(`${dir}reference.jpg`, { encoding: FileSystem.EncodingType.Base64 });
  const ref = decodeJpeg(b64, false);
  const entry = { template: getTemplate(spec), reference: { width: ref.width, height: ref.height, data: ref.data } };
  loaded.set(id, entry);
  return entry;
}

/** Synchronous lookup of an already-loaded template (builtin or custom) for drawing overlays. */
export function loadedTemplate(id: string): CompiledTemplate | undefined {
  const builtin = BUILTIN_TEMPLATES.find((t) => t.id === id);
  return builtin ? getTemplate(builtin) : loaded.get(id)?.template;
}

export function useTemplateCacheVersion(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}
