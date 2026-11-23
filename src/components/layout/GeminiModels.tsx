import { useEffect, useRef, useState } from 'react';
import { ApiError, ImageBlockedError } from '../../lib/api/errors';
import { generateImage, listModels, type GeminiModel } from '../../lib/api/gemini';
import { imageDimensions, isWidescreen, type Dimensions } from '../../lib/image';
import { DEFAULT_BRIEF_MODEL, DEFAULT_MODELS, MAX_ANCHORS_LIMIT, type ModelRoles } from '../../lib/settings';
import { useSettingsStore } from '../../store/settingsStore';

const input = 'w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-accent';
const label = 'block text-xs font-medium text-neutral-400 mb-1';
const small = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:opacity-40';

const ROLES: { role: keyof ModelRoles; text: string; short: string }[] = [
  { role: 'workhorse', text: 'Workhorse (default for anchors and keyframes)', short: 'Workhorse' },
  { role: 'hero', text: 'Hero (hero anchors, strict continuity)', short: 'Hero' },
  { role: 'draft', text: 'Draft (quick, cheap)', short: 'Draft' },
];

const TEST_PROMPT =
  'A minimal test card: a plain dark gray 16:9 widescreen frame with one small amber triangle in the exact center. No text, no watermark.';

type Listing = { status: 'idle' } | { status: 'loading' } | { status: 'ok'; models: GeminiModel[] } | { status: 'error'; message: string };
type Test =
  | { status: 'idle' }
  | { status: 'running'; role: keyof ModelRoles }
  | { status: 'ok'; role: keyof ModelRoles; model: string; url: string; dims: Dimensions; ms: number; text: string }
  | { status: 'error'; role: keyof ModelRoles; message: string };

const errText = (e: unknown) =>
  e instanceof ApiError || e instanceof ImageBlockedError ? e.message : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;

export default function GeminiModels() {
  const { geminiKey, settings, updateSettings, resetModels } = useSettingsStore();
  const [listing, setListing] = useState<Listing>({ status: 'idle' });
  const [test, setTest] = useState<Test>({ status: 'idle' });
  const urlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  }, []);

  const loadModels = async () => {
    setListing({ status: 'loading' });
    try {
      setListing({ status: 'ok', models: await listModels({ apiKey: geminiKey }) });
    } catch (e) {
      setListing({ status: 'error', message: errText(e) });
    }
  };

  const runTest = async (role: keyof ModelRoles) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    abortRef.current?.abort();
    const ctrl = (abortRef.current = new AbortController());
    setTest({ status: 'running', role });
    const model = settings.models[role];
    const t0 = performance.now();
    try {
      const img = await generateImage({ apiKey: geminiKey, model, prompt: TEST_PROMPT, signal: ctrl.signal });
      const dims = await imageDimensions(img.blob);
      const url = (urlRef.current = URL.createObjectURL(img.blob));
      setTest({ status: 'ok', role, model, url, dims, ms: performance.now() - t0, text: img.text });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setTest({ status: 'error', role, message: errText(e) });
    }
  };

  const models = listing.status === 'ok' ? listing.models : [];
  const imageModels = models.filter((m) => m.isImage);
  const known = new Set(models.map((m) => m.id));

  return (
    <section className="mt-6 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Gemini image models</h3>
        <button type="button" onClick={resetModels} className="text-xs text-neutral-400 underline hover:text-neutral-200">Reset to defaults</button>
      </div>

      <datalist id="gemini-model-ids">{imageModels.map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</datalist>

      {ROLES.map(({ role, text }) => (
        <div key={role}>
          <label htmlFor={`model-${role}`} className={label}>{text}</label>
          <div className="flex gap-2">
            <input
              id={`model-${role}`}
              key={settings.models[role]}
              list="gemini-model-ids"
              className={input}
              defaultValue={settings.models[role]}
              placeholder={DEFAULT_MODELS[role]}
              spellCheck={false}
              onBlur={(e) => e.target.value.trim() !== settings.models[role] && updateSettings({ models: { [role]: e.target.value } })}
            />
            <button type="button" disabled={!geminiKey || test.status === 'running'} onClick={() => void runTest(role)} className={small} aria-label={`Test ${role} model`}>
              Test
            </button>
          </div>
          {listing.status === 'ok' && (
            <p className={`mt-1 text-xs ${known.has(settings.models[role]) ? 'text-emerald-400' : 'text-amber-300'}`}>
              {known.has(settings.models[role]) ? 'Available to your key.' : 'Not in your key\'s model list. Pick one below, or check the spelling.'}
            </p>
          )}
        </div>
      ))}

      <div>
        <label htmlFor="model-brief" className={label}>Audio brief model (listens to your song; text output)</label>
        <datalist id="gemini-text-model-ids">{models.filter((m) => !m.isImage).map((m) => <option key={m.id} value={m.id}>{m.displayName}</option>)}</datalist>
        <input
          id="model-brief"
          key={settings.briefModel}
          list="gemini-text-model-ids"
          className={input}
          defaultValue={settings.briefModel}
          placeholder={DEFAULT_BRIEF_MODEL}
          spellCheck={false}
          onBlur={(e) => e.target.value.trim() !== settings.briefModel && updateSettings({ briefModel: e.target.value })}
        />
        {listing.status === 'ok' && (
          <p className={`mt-1 text-xs ${known.has(settings.briefModel) ? 'text-emerald-400' : 'text-amber-300'}`}>
            {known.has(settings.briefModel) ? 'Available to your key.' : "Not in your key's model list. Pick a text model that accepts audio."}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!geminiKey || listing.status === 'loading'} onClick={() => void loadModels()} className={small}>
          {listing.status === 'loading' ? 'Checking…' : 'Test key & list models'}
        </button>
        {!geminiKey && <span className="text-xs text-neutral-500">Add a Gemini key above first.</span>}
      </div>

      {listing.status === 'error' && <p role="alert" className="text-xs text-red-300">{listing.message}</p>}
      {listing.status === 'ok' && (
        <div className="rounded border border-neutral-800 p-2">
          <p className="text-xs text-neutral-400">
            Key works. {imageModels.length} image model{imageModels.length === 1 ? '' : 's'} found
            {models.length > imageModels.length ? ` (${models.length - imageModels.length} other model${models.length - imageModels.length === 1 ? '' : 's'} hidden)` : ''}. Assign one to a role:
          </p>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs">
            {imageModels.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-1">
                <code className="mr-1 text-neutral-200">{m.id}</code>
                <span className="mr-auto text-neutral-500">{m.displayName !== m.id ? m.displayName : ''}</span>
                {ROLES.map(({ role, short }) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => updateSettings({ models: { [role]: m.id } })}
                    className={`rounded border px-1.5 py-0.5 ${settings.models[role] === m.id ? 'border-accent text-accent' : 'border-neutral-700 hover:bg-neutral-800'}`}
                    aria-label={`Use ${m.id} as ${short}`}
                  >
                    {short}
                  </button>
                ))}
              </li>
            ))}
            {imageModels.length === 0 && <li className="text-amber-300">No image models listed for this key.</li>}
          </ul>
        </div>
      )}

      {test.status === 'running' && <p role="status" className="text-xs text-neutral-300">Generating a test image with the {test.role} model…</p>}
      {test.status === 'error' && <p role="alert" className="text-xs text-red-300">{test.role} test failed: {test.message}</p>}
      {test.status === 'ok' && (
        <figure className="rounded border border-neutral-800 p-2" data-testid="gemini-test-result">
          <img src={test.url} alt="Test generation result" className="max-h-40 rounded border border-neutral-800" />
          <figcaption className="mt-1 text-xs text-neutral-400">
            <code>{test.model}</code> · {test.dims.width}×{test.dims.height}{' '}
            {isWidescreen(test.dims) ? <span className="text-emerald-400">16:9 ✓</span> : <span className="text-amber-300">not 16:9 ⚠</span>} · {(test.ms / 1000).toFixed(1)}s
            {test.text && <span className="block text-neutral-500">Model said: {test.text}</span>}
          </figcaption>
        </figure>
      )}
      <p className="text-xs text-neutral-500">Each Test renders one real image on your Gemini account (a few cents at most).</p>

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
  );
}
