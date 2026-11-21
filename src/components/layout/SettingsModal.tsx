import { useEffect, useState } from 'react';
import { CLAUDE_MODEL_PRESETS, DEFAULT_MODELS, MAX_ANCHORS_LIMIT } from '../../lib/settings';
import { formatBytes, getStorageInfo, requestPersistence, type StorageInfo } from '../../lib/storage';
import { useSettingsStore } from '../../store/settingsStore';

const input = 'w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-amber-400';
const label = 'block text-xs font-medium text-neutral-400 mb-1';

function KeyField({ id, text, value, onSave }: { id: string; text: string; value: string; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [show, setShow] = useState(false);
  useEffect(() => setDraft(value), [value]);
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <div className="flex gap-2">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => draft.trim() !== value && onSave(draft)}
          placeholder="Not set"
          autoComplete="off"
          spellCheck={false}
          className={input}
        />
        <button type="button" onClick={() => setShow((s) => !s)} className="rounded border border-neutral-700 px-2 text-xs hover:bg-neutral-800">
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
    </div>
  );
}

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { anthropicKey, geminiKey, settings, persistent, setAnthropicKey, setGeminiKey, updateSettings, resetModels, forgetKeys } =
    useSettingsStore();
  const [storage, setStorage] = useState<StorageInfo | null>(null);
  const isPreset = CLAUDE_MODEL_PRESETS.some((p) => p.id === settings.claudeModel);
  const [customClaude, setCustomClaude] = useState(!isPreset);

  useEffect(() => {
    if (!open) return;
    void getStorageInfo().then(setStorage);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="my-8 w-full max-w-xl rounded-lg border border-neutral-700 bg-neutral-900 p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="settings-title" className="text-lg font-semibold">Settings</h2>

        <p className="mt-3 rounded border border-amber-700/50 bg-amber-950/40 p-3 text-sm text-amber-200">
          Keys are stored in this browser's <code>localStorage</code> in plain text and are sent only to Anthropic and Google.
          On GitHub Pages that storage is shared with every other site on the same <code>github.io</code> origin. Never commit keys.
        </p>
        {!persistent && (
          <p className="mt-2 rounded border border-red-700/50 bg-red-950/40 p-3 text-sm text-red-200">
            Browser storage is blocked here. Keys will be kept in memory for this tab only and will be lost on reload.
          </p>
        )}

        <section className="mt-5 space-y-3">
          <h3 className="text-sm font-semibold">API keys</h3>
          <KeyField id="anthropic-key" text="Anthropic API key" value={anthropicKey} onSave={setAnthropicKey} />
          <KeyField id="gemini-key" text="Gemini API key" value={geminiKey} onSave={setGeminiKey} />
          <button
            type="button"
            onClick={() => window.confirm('Remove both API keys from this browser?') && forgetKeys()}
            className="rounded border border-red-800 px-3 py-1 text-xs text-red-300 hover:bg-red-950"
          >
            Forget keys
          </button>
        </section>

        <section className="mt-6 space-y-3">
          <h3 className="text-sm font-semibold">Claude (Co-Director)</h3>
          <div>
            <label htmlFor="claude-model" className={label}>Model</label>
            <select
              id="claude-model"
              className={input}
              value={customClaude ? '__custom' : settings.claudeModel}
              onChange={(e) => {
                if (e.target.value === '__custom') setCustomClaude(true);
                else {
                  setCustomClaude(false);
                  updateSettings({ claudeModel: e.target.value });
                }
              }}
            >
              {CLAUDE_MODEL_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              <option value="__custom">Custom model ID…</option>
            </select>
            {customClaude && (
              <input
                aria-label="Custom Claude model ID"
                className={`${input} mt-2`}
                defaultValue={isPreset ? '' : settings.claudeModel}
                placeholder="model id"
                onBlur={(e) => e.target.value.trim() && updateSettings({ claudeModel: e.target.value })}
              />
            )}
          </div>
        </section>

        <section className="mt-6 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Gemini image models</h3>
            <button type="button" onClick={resetModels} className="text-xs text-neutral-400 underline hover:text-neutral-200">
              Reset to defaults
            </button>
          </div>
          {(
            [
              ['workhorse', 'Workhorse (default for anchors and keyframes)'],
              ['hero', 'Hero (hero anchors, strict continuity)'],
              ['draft', 'Draft (quick, cheap)'],
            ] as const
          ).map(([role, text]) => (
            <div key={role}>
              <label htmlFor={`model-${role}`} className={label}>{text}</label>
              <input
                id={`model-${role}`}
                key={settings.models[role]}
                className={input}
                defaultValue={settings.models[role]}
                placeholder={DEFAULT_MODELS[role]}
                spellCheck={false}
                onBlur={(e) => e.target.value.trim() !== settings.models[role] && updateSettings({ models: { [role]: e.target.value } })}
              />
            </div>
          ))}
          <p className="text-xs text-neutral-500">These IDs are unverified free text. A "Test & list models" check arrives with image generation.</p>
          <div>
            <label htmlFor="max-anchors" className={label}>Max reference anchors per scene keyframe</label>
            <input
              id="max-anchors"
              type="number"
              min={1}
              max={MAX_ANCHORS_LIMIT}
              className={`${input} w-24`}
              value={settings.maxAnchorsPerScene}
              onChange={(e) => updateSettings({ maxAnchorsPerScene: Number(e.target.value) })}
            />
          </div>
        </section>

        <section className="mt-6 space-y-2">
          <h3 className="text-sm font-semibold">Storage</h3>
          <p className="text-sm text-neutral-400">
            {storage?.usage !== undefined && storage.quota !== undefined
              ? `${formatBytes(storage.usage)} used of about ${formatBytes(storage.quota)}. `
              : ''}
            {storage?.persisted === true && 'Persistent storage granted: the browser will not evict your projects.'}
            {storage?.persisted === false && 'Not persistent: the browser may evict projects under disk pressure.'}
            {storage?.persisted === null && 'Storage status unavailable.'}
          </p>
          {storage?.persisted === false && (
            <button
              type="button"
              onClick={async () => { await requestPersistence(); setStorage(await getStorageInfo()); }}
              className="rounded border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-800"
            >
              Request persistent storage
            </button>
          )}
        </section>

        <div className="mt-6 text-right">
          <button onClick={onClose} className="rounded bg-neutral-100 px-3 py-1.5 text-sm font-medium text-neutral-900">Done</button>
        </div>
      </div>
    </div>
  );
}
