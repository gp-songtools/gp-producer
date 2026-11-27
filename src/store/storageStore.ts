import { create } from 'zustand';
import { getStorageInfo } from '../lib/storage';
import { describeStorageError, USAGE_URGENT, USAGE_WARN, type StorageProblem } from '../lib/storageErrors';

export interface UsageInfo {
  used: number;
  quota: number;
  fraction: number;
}

interface StorageState {
  /** The latest failed save, shown as a banner until a save works or the user dismisses it. */
  problem: StorageProblem | null;
  usage: UsageInfo | null;
  /** The user closed the "getting full" warning for this session. */
  usageDismissed: boolean;
  report: (e: unknown) => void;
  /** A save worked, so any earlier failure is over. */
  saved: () => void;
  dismissProblem: () => void;
  dismissUsage: () => void;
  /** Re-reads how much of the quota is used. Cheap; call it after big writes. */
  refresh: () => Promise<void>;
}

export const useStorageStore = create<StorageState>((set, get) => ({
  problem: null,
  usage: null,
  usageDismissed: false,
  report: (e) => {
    const next = describeStorageError(e);
    set({ problem: next });
    // A full disk is also worth re-measuring so the numbers in the banner are current.
    if (next.kind === 'quota') void get().refresh();
  },
  saved: () => {
    if (get().problem) set({ problem: null });
  },
  dismissProblem: () => set({ problem: null }),
  dismissUsage: () => set({ usageDismissed: true }),
  refresh: async () => {
    const info = await getStorageInfo();
    if (info.usage === undefined || !info.quota) return set({ usage: null });
    set({ usage: { used: info.usage, quota: info.quota, fraction: info.usage / info.quota } });
  },
}));

/** 'urgent' above 95%, 'warn' above 80%, otherwise null. */
export const usageLevel = (u: UsageInfo | null): 'warn' | 'urgent' | null => (!u ? null : u.fraction >= USAGE_URGENT ? 'urgent' : u.fraction >= USAGE_WARN ? 'warn' : null);
