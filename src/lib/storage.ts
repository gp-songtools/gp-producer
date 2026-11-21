export interface StorageInfo {
  persisted: boolean | null;
  usage?: number;
  quota?: number;
}

export async function getStorageInfo(): Promise<StorageInfo> {
  try {
    const s = navigator.storage;
    const [persisted, est] = await Promise.all([s.persisted?.() ?? null, s.estimate?.() ?? {}]);
    return { persisted, usage: est.usage, quota: est.quota };
  } catch {
    return { persisted: null };
  }
}

export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage.persist?.()) ?? false;
  } catch {
    return false;
  }
}

export const formatBytes = (n: number) =>
  n < 1024 ** 2 ? `${Math.round(n / 1024)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(1)} MB` : `${(n / 1024 ** 3).toFixed(2)} GB`;
