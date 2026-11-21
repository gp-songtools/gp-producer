export interface PoolResult<T> {
  ok: number;
  failed: { item: T; error: unknown }[];
  /** Items never started because the signal aborted. */
  skipped: number;
}

/** Runs `worker` over `items` with at most `concurrency` in flight. One failure never stops the others. */
export async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>, signal?: AbortSignal): Promise<PoolResult<T>> {
  const result: PoolResult<T> = { ok: 0, failed: [], skipped: 0 };
  let next = 0;
  const lane = async () => {
    for (;;) {
      if (signal?.aborted) return;
      const i = next++;
      if (i >= items.length) return;
      try {
        await worker(items[i]);
        result.ok++;
      } catch (error) {
        result.failed.push({ item: items[i], error });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, lane));
  result.skipped = items.length - result.ok - result.failed.length;
  return result;
}
