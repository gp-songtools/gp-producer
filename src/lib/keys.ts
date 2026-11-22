// Every localStorage access is wrapped: it can throw (private windows, blocked site data) or come back empty.
export const STORAGE_KEYS = {
  anthropic: 'gpp.anthropicKey',
  gemini: 'gpp.geminiKey',
  settings: 'gpp.settings',
  audioConsent: 'gpp.audioToGeminiOk',
} as const;

export function storageGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

/** Returns false if the write failed. */
export function storageSet(key: string, value: string): boolean {
  try {
    globalThis.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key: string): void {
  try {
    globalThis.localStorage?.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function storageAvailable(): boolean {
  try {
    const k = '__gpp_probe__';
    globalThis.localStorage.setItem(k, '1');
    globalThis.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}
