import { useSyncExternalStore } from 'react';
import { loadSettings, SETTINGS_CHANGED, type Settings } from './settings.js';

function subscribe(onChange: () => void): () => void {
  window.addEventListener(SETTINGS_CHANGED, onChange);
  return () => window.removeEventListener(SETTINGS_CHANGED, onChange);
}

/**
 * One setting, live. Re-renders the caller whenever any save changes it, so a
 * preference that alters what is already on screen takes effect the moment it
 * is set rather than at the next table. Only for primitive settings: the
 * snapshot is compared by identity.
 */
export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useSyncExternalStore(subscribe, () => loadSettings()[key]);
}

/** Whether to draw the per-industry textures (#19). */
export function useIndustryPatterns(): boolean {
  return useSetting('industryPatterns');
}
