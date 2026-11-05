/**
 * Local-first persistence for exams and graded sheets (AsyncStorage + files).
 * Everything works offline; nothing here talks to the network.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import { useSyncExternalStore } from 'react';

import type { Exam, Sheet } from './models';

const EXAMS_KEY = 'scantron.exams.v2';
const SHEETS_KEY = (examId: string) => `scantron.sheets.v2.${examId}`;
export const SCANS_DIR = `${FileSystem.documentDirectory}scans/`;

type State = { ready: boolean; exams: Exam[]; sheets: Record<string, Sheet[]> };
let state: State = { ready: false, exams: [], sheets: {} };
const listeners = new Set<() => void>();

function emit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function uid(prefix = ''): string {
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}${Date.now().toString(36)}${r}`;
}

let loading: Promise<void> | null = null;
export function loadStore(): Promise<void> {
  if (!loading) {
    loading = (async () => {
      const raw = await AsyncStorage.getItem(EXAMS_KEY);
      const exams: Exam[] = raw ? JSON.parse(raw) : [];
      const sheets: Record<string, Sheet[]> = {};
      const entries = await AsyncStorage.multiGet(exams.map((e) => SHEETS_KEY(e.id)));
      entries.forEach(([k, v], i) => {
        sheets[exams[i].id] = v ? JSON.parse(v) : [];
        void k;
      });
      await FileSystem.makeDirectoryAsync(SCANS_DIR, { intermediates: true }).catch(() => undefined);
      emit({ ready: true, exams, sheets });
    })();
  }
  return loading;
}

async function persistExams(exams: Exam[]) {
  await AsyncStorage.setItem(EXAMS_KEY, JSON.stringify(exams));
}
async function persistSheets(examId: string, sheets: Sheet[]) {
  await AsyncStorage.setItem(SHEETS_KEY(examId), JSON.stringify(sheets));
}

// ----------------------------------------------------------------------------- exams

export async function saveExam(exam: Exam): Promise<void> {
  const exists = state.exams.some((e) => e.id === exam.id);
  const updated = { ...exam, updatedAt: Date.now() };
  const exams = exists ? state.exams.map((e) => (e.id === exam.id ? updated : e)) : [updated, ...state.exams];
  emit({ ...state, exams, sheets: exists ? state.sheets : { ...state.sheets, [exam.id]: [] } });
  await persistExams(exams);
}

export async function deleteExam(examId: string): Promise<void> {
  const exams = state.exams.filter((e) => e.id !== examId);
  const { [examId]: _, ...sheets } = state.sheets;
  emit({ ...state, exams, sheets });
  await persistExams(exams);
  await AsyncStorage.removeItem(SHEETS_KEY(examId));
  await FileSystem.deleteAsync(`${SCANS_DIR}${examId}/`, { idempotent: true }).catch(() => undefined);
}

// ----------------------------------------------------------------------------- sheets

export async function upsertSheet(sheet: Sheet): Promise<void> {
  const list = state.sheets[sheet.examId] ?? [];
  const exists = list.some((s) => s.id === sheet.id);
  const next = exists ? list.map((s) => (s.id === sheet.id ? sheet : s)) : [sheet, ...list];
  emit({ ...state, sheets: { ...state.sheets, [sheet.examId]: next } });
  await persistSheets(sheet.examId, next);
}

export async function deleteSheet(examId: string, sheetId: string): Promise<void> {
  const list = state.sheets[examId] ?? [];
  const sheet = list.find((s) => s.id === sheetId);
  const next = list.filter((s) => s.id !== sheetId);
  emit({ ...state, sheets: { ...state.sheets, [examId]: next } });
  await persistSheets(examId, next);
  for (const uri of [sheet?.photoUri, sheet?.annotatedUri, ...Object.values(sheet?.regionUris ?? {}).map((r) => r.uri)]) {
    if (uri) await FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => undefined);
  }
}

export function getExams(): Exam[] {
  return state.exams;
}
export function getExam(id: string): Exam | undefined {
  return state.exams.find((e) => e.id === id);
}
export function getSheets(examId: string): Sheet[] {
  return state.sheets[examId] ?? [];
}

// ----------------------------------------------------------------------------- hooks

export function useStoreReady(): boolean {
  return useSyncExternalStore(subscribe, () => state.ready);
}
export function useExams(): Exam[] {
  return useSyncExternalStore(subscribe, () => state.exams);
}
export function useExam(id: string | undefined): Exam | undefined {
  return useSyncExternalStore(subscribe, () => state.exams.find((e) => e.id === id));
}
const EMPTY: Sheet[] = [];
export function useSheets(examId: string | undefined): Sheet[] {
  return useSyncExternalStore(subscribe, () => (examId ? state.sheets[examId] ?? EMPTY : EMPTY));
}
export function useAllSheets(): Record<string, Sheet[]> {
  return useSyncExternalStore(subscribe, () => state.sheets);
}
