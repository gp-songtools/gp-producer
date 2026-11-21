// Stub for M0. API key and model fields arrive in M1.
export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
    >
      <div className="w-full max-w-lg rounded-lg border border-neutral-700 bg-neutral-900 p-5" onClick={(e) => e.stopPropagation()}>
        <h2 id="settings-title" className="text-lg font-semibold">Settings</h2>
        <p className="mt-3 rounded border border-amber-700/50 bg-amber-950/40 p-3 text-sm text-amber-200">
          API keys are stored in this browser's <code>localStorage</code> in plain text. On GitHub Pages that storage is shared
          with every other site on the same <code>github.io</code> origin. Never commit keys.
        </p>
        <p className="mt-3 text-sm text-neutral-400">Anthropic and Gemini key fields and model choices arrive in the next milestone.</p>
        <div className="mt-5 text-right">
          <button onClick={onClose} className="rounded bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-900">Close</button>
        </div>
      </div>
    </div>
  );
}
