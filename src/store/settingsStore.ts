import { create } from 'zustand';
import { STORAGE_KEYS, storageAvailable, storageGet, storageRemove, storageSet } from '../lib/keys';
import { DEFAULT_MODELS, DEFAULT_SETTINGS, sanitizeSettings, type Settings } from '../lib/settings';

interface SettingsState {
  anthropicKey: string;
  geminiKey: string;
  settings: Settings;
  /** False when localStorage is blocked: keys then live in memory for this tab only. */
  persistent: boolean;
  setAnthropicKey: (k: string) => void;
  setGeminiKey: (k: string) => void;
  updateSettings: (patch: Partial<Omit<Settings, 'models'>> & { models?: Partial<Settings['models']> }) => void;
  resetModels: () => void;
  forgetKeys: () => void;
  /** Re-reads localStorage (used on init and in tests). */
  reload: () => void;
}

function readSettings(): Settings {
  const raw = storageGet(STORAGE_KEYS.settings);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const read = () => ({
  anthropicKey: storageGet(STORAGE_KEYS.anthropic) ?? '',
  geminiKey: storageGet(STORAGE_KEYS.gemini) ?? '',
  settings: readSettings(),
  persistent: storageAvailable(),
});

function saveKey(storageKey: string, value: string) {
  if (value) storageSet(storageKey, value);
  else storageRemove(storageKey);
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...read(),
  setAnthropicKey: (k) => {
    const v = k.trim();
    saveKey(STORAGE_KEYS.anthropic, v);
    set({ anthropicKey: v });
  },
  setGeminiKey: (k) => {
    const v = k.trim();
    saveKey(STORAGE_KEYS.gemini, v);
    set({ geminiKey: v });
  },
  updateSettings: (patch) => {
    const cur = get().settings;
    const next = sanitizeSettings({ ...cur, ...patch, models: { ...cur.models, ...patch.models } });
    storageSet(STORAGE_KEYS.settings, JSON.stringify(next));
    set({ settings: next });
  },
  resetModels: () => get().updateSettings({ models: { ...DEFAULT_MODELS } }),
  forgetKeys: () => {
    storageRemove(STORAGE_KEYS.anthropic);
    storageRemove(STORAGE_KEYS.gemini);
    set({ anthropicKey: '', geminiKey: '' });
  },
  reload: () => set(read()),
}));
