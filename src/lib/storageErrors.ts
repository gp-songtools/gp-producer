/** True for "the browser has no room left" errors, whatever the browser calls them. */
export function isQuotaError(e: unknown): boolean {
  const x = e as { name?: string; code?: number; message?: string } | null;
  if (!x || typeof x !== 'object') return false;
  return (
    x.name === 'QuotaExceededError' ||
    x.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    x.code === 22 ||
    x.code === 1014 ||
    /quota/i.test(String(x.message ?? '')) && /exceed|reach|full/i.test(String(x.message ?? ''))
  );
}

export type StorageProblemKind = 'quota' | 'other';

export interface StorageProblem {
  kind: StorageProblemKind;
  /** What the user is told. */
  message: string;
  at: number;
}

export const QUOTA_MESSAGE = "Your browser's storage is full, so your latest changes were not saved.";

/** A user-facing description of a failed save. */
export function describeStorageError(e: unknown): StorageProblem {
  if (isQuotaError(e)) return { kind: 'quota', message: QUOTA_MESSAGE, at: Date.now() };
  const detail = e instanceof Error && e.message ? `: ${e.message}` : '';
  return { kind: 'other', message: `Your browser couldn't save your changes${detail}`, at: Date.now() };
}

/** Image saves: what a card shows when Gemini made the image but there was nowhere to keep it. */
export const IMAGE_QUOTA_MESSAGE =
  "Gemini made the image, but your browser has no room to keep it, so it was not saved. Export a backup, free some space (Settings, Storage), then generate it again.";

/** Fraction of the quota at which a warning is shown, and at which it becomes urgent. */
export const USAGE_WARN = 0.8;
export const USAGE_URGENT = 0.95;
