import { isAbort } from './errors';

/** Statuses worth retrying: rate limit, overload and transient server errors. */
export const RETRYABLE = new Set([429, 500, 502, 503, 504, 529]);

const BACKOFF_MS = [2000, 5000, 12000];
export const MAX_ATTEMPTS = BACKOFF_MS.length + 1;
const MAX_WAIT_MS = 30_000;

/** Delay before retry number `attempt` (0-based), honoring a retry-after header (seconds) when present. */
export function retryDelayMs(attempt: number, retryAfter?: string | null): number {
  const secs = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(secs) && secs >= 0) return Math.min(MAX_WAIT_MS, Math.round(secs * 1000));
  return BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
}

export type Sleep = (ms: number, signal?: AbortSignal) => Promise<void>;

export const sleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export { isAbort };
