import { describe, expect, it } from 'vitest';
import { runPool } from '../pool';

const tick = () => new Promise((r) => setTimeout(r, 1));

describe('runPool', () => {
  it('runs every item and reports success', async () => {
    const seen: number[] = [];
    const r = await runPool([1, 2, 3, 4, 5], 2, async (n) => void seen.push(n));
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(r).toEqual({ ok: 5, failed: [], skipped: 0 });
  });

  it('never exceeds the concurrency limit', async () => {
    let live = 0;
    let peak = 0;
    await runPool(Array.from({ length: 10 }, (_, i) => i), 3, async () => {
      peak = Math.max(peak, ++live);
      await tick();
      live--;
    });
    expect(peak).toBe(3);
  });

  it('keeps going after a failure and reports it', async () => {
    const r = await runPool([1, 2, 3, 4], 2, async (n) => {
      if (n === 2) throw new Error('boom');
    });
    expect(r.ok).toBe(3);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].item).toBe(2);
    expect((r.failed[0].error as Error).message).toBe('boom');
  });

  it('stops starting new items once aborted, and counts them as skipped', async () => {
    const ctrl = new AbortController();
    const started: number[] = [];
    const r = await runPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      started.push(n);
      if (n === 2) ctrl.abort();
      await tick();
    }, ctrl.signal);
    expect(started.length).toBeLessThan(6);
    expect(r.skipped).toBe(6 - r.ok - r.failed.length);
    expect(r.skipped).toBeGreaterThan(0);
  });

  it('handles an empty list and a concurrency larger than the list', async () => {
    expect(await runPool([], 2, async () => undefined)).toEqual({ ok: 0, failed: [], skipped: 0 });
    expect((await runPool([1], 8, async () => undefined)).ok).toBe(1);
  });
});
