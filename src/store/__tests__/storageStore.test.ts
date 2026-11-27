import { beforeEach, describe, expect, it, vi } from 'vitest';

const info = vi.hoisted(() => ({ value: { persisted: false, usage: 50, quota: 100 } as { persisted: boolean | null; usage?: number; quota?: number } }));
vi.mock('../../lib/storage', async (orig) => ({ ...(await orig<typeof import('../../lib/storage')>()), getStorageInfo: async () => info.value }));

import { usageLevel, useStorageStore } from '../storageStore';

beforeEach(() => {
  useStorageStore.setState({ problem: null, usage: null, usageDismissed: false });
  info.value = { persisted: false, usage: 50, quota: 100 };
});

describe('storageStore', () => {
  it('records a failed save, and clears it once a save works', () => {
    const s = useStorageStore.getState();
    s.report(new DOMException('full', 'QuotaExceededError'));
    expect(useStorageStore.getState().problem?.kind).toBe('quota');
    useStorageStore.getState().saved();
    expect(useStorageStore.getState().problem).toBeNull();
  });
  it('can be dismissed', () => {
    useStorageStore.getState().report(new Error('x'));
    useStorageStore.getState().dismissProblem();
    expect(useStorageStore.getState().problem).toBeNull();
  });
  it('measures usage, and re-measures when the disk turns out to be full', async () => {
    await useStorageStore.getState().refresh();
    expect(useStorageStore.getState().usage).toEqual({ used: 50, quota: 100, fraction: 0.5 });
    info.value = { persisted: false, usage: 99, quota: 100 };
    useStorageStore.getState().report(new DOMException('full', 'QuotaExceededError'));
    await new Promise((r) => setTimeout(r, 5));
    expect(useStorageStore.getState().usage?.fraction).toBeCloseTo(0.99);
  });
  it('shows no usage when the browser cannot say', async () => {
    info.value = { persisted: null };
    await useStorageStore.getState().refresh();
    expect(useStorageStore.getState().usage).toBeNull();
  });
  it('warns from 80% and urgently from 95%', () => {
    const u = (fraction: number) => ({ used: fraction * 100, quota: 100, fraction });
    expect(usageLevel(u(0.5))).toBeNull();
    expect(usageLevel(u(0.8))).toBe('warn');
    expect(usageLevel(u(0.94))).toBe('warn');
    expect(usageLevel(u(0.95))).toBe('urgent');
    expect(usageLevel(null)).toBeNull();
  });
});
