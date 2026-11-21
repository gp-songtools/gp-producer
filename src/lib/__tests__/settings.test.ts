import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEYS } from '../keys';
import { DEFAULT_MODELS, DEFAULT_SETTINGS, sanitizeSettings } from '../settings';
import { useSettingsStore } from '../../store/settingsStore';

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() { return this.m.size; }
  clear() { this.m.clear(); }
  getItem(k: string) { return this.m.get(k) ?? null; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
  removeItem(k: string) { this.m.delete(k); }
  setItem(k: string, v: string) { this.m.set(k, v); }
}

const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { value: new MemStorage(), configurable: true });
  useSettingsStore.getState().reload();
});
afterEach(() => {
  if (original) Object.defineProperty(globalThis, 'localStorage', original);
  else delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe('sanitizeSettings', () => {
  it('returns defaults for junk', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('x')).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ claudeModel: 5, models: 'x', maxAnchorsPerScene: 'a' })).toEqual(DEFAULT_SETTINGS);
  });
  it('accepts known effort levels and falls back to default for anything else', () => {
    for (const e of ['default', 'low', 'medium', 'high', 'xhigh', 'max'])
      expect(sanitizeSettings({ claudeEffort: e }).claudeEffort).toBe(e);
    for (const bad of ['LOW', 'ultra', 5, null, undefined, {}]) expect(sanitizeSettings({ claudeEffort: bad }).claudeEffort).toBe('default');
    expect(DEFAULT_SETTINGS.claudeEffort).toBe('default');
  });

  it('trims, falls back per field and clamps the anchor cap', () => {
    const s = sanitizeSettings({ claudeModel: ' claude-x ', models: { hero: '  ', draft: 'd' }, maxAnchorsPerScene: 99 });
    expect(s.claudeModel).toBe('claude-x');
    expect(s.models).toEqual({ ...DEFAULT_MODELS, draft: 'd' });
    expect(s.maxAnchorsPerScene).toBe(6);
    expect(sanitizeSettings({ maxAnchorsPerScene: 0 }).maxAnchorsPerScene).toBe(1);
  });
});

describe('settings store', () => {
  it('saves and removes keys in localStorage, trimmed', () => {
    const s = useSettingsStore.getState();
    s.setAnthropicKey('  sk-ant-1 ');
    s.setGeminiKey('AIza');
    expect(localStorage.getItem(STORAGE_KEYS.anthropic)).toBe('sk-ant-1');
    expect(useSettingsStore.getState().geminiKey).toBe('AIza');
    s.setGeminiKey('');
    expect(localStorage.getItem(STORAGE_KEYS.gemini)).toBeNull();
  });

  it('forgetKeys clears both keys but keeps model settings', () => {
    const s = useSettingsStore.getState();
    s.setAnthropicKey('a');
    s.setGeminiKey('b');
    s.updateSettings({ claudeModel: 'claude-opus-5-5' });
    s.forgetKeys();
    expect(localStorage.getItem(STORAGE_KEYS.anthropic)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.gemini)).toBeNull();
    expect(useSettingsStore.getState().settings.claudeModel).toBe('claude-opus-5-5');
  });

  it('persists settings and survives a reload', () => {
    const s = useSettingsStore.getState();
    s.updateSettings({ models: { hero: 'my-hero' }, maxAnchorsPerScene: 4 });
    s.reload();
    const { settings } = useSettingsStore.getState();
    expect(settings.models.hero).toBe('my-hero');
    expect(settings.models.workhorse).toBe(DEFAULT_MODELS.workhorse);
    expect(settings.maxAnchorsPerScene).toBe(4);
  });

  it('persists the effort choice across a reload', () => {
    useSettingsStore.getState().updateSettings({ claudeEffort: 'medium' });
    useSettingsStore.getState().reload();
    expect(useSettingsStore.getState().settings.claudeEffort).toBe('medium');
  });

  it('resets model roles to defaults', () => {
    const s = useSettingsStore.getState();
    s.updateSettings({ models: { workhorse: 'custom' } });
    s.resetModels();
    expect(useSettingsStore.getState().settings.models).toEqual(DEFAULT_MODELS);
  });

  it('ignores corrupt stored JSON', () => {
    localStorage.setItem(STORAGE_KEYS.settings, '{not json');
    useSettingsStore.getState().reload();
    expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
  });

  it('reports non-persistent and keeps working when localStorage throws', () => {
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() { throw new Error('blocked'); },
    });
    useSettingsStore.getState().reload();
    expect(useSettingsStore.getState().persistent).toBe(false);
    expect(() => useSettingsStore.getState().setAnthropicKey('k')).not.toThrow();
    expect(useSettingsStore.getState().anthropicKey).toBe('k'); // in memory for this tab
  });
});
