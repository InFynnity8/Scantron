import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type EnginePreference = 'auto' | 'device' | 'server';

export interface Settings {
  omrUrl: string;
  authUrl: string;
  /** auto = on-device for printed Scantron sheets, server for everything else */
  engine: EnginePreference;
  liveScan: boolean;
  autoCapture: boolean;
  haptics: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  omrUrl: process.env.EXPO_PUBLIC_OMR_API_URL ?? 'https://scantron-omr.onrender.com',
  authUrl: process.env.EXPO_PUBLIC_AUTH_API_URL ?? 'https://scantron-backend.onrender.com',
  engine: 'auto',
  liveScan: true,
  autoCapture: true,
  haptics: true,
};

const KEY = 'scantron.settings.v1';
let current: Settings = DEFAULT_SETTINGS;
const listeners = new Set<() => void>();

export async function loadSettings(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) current = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    current = DEFAULT_SETTINGS;
  }
  listeners.forEach((l) => l());
}

export function getSettings(): Settings {
  return current;
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  current = { ...current, ...patch };
  listeners.forEach((l) => l());
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function trimUrl(u: string): string {
  return u.trim().replace(/\/+$/, '');
}
