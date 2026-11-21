import { useMemo, useState } from 'react';
import { extractBriefPrompt, fillBriefPrompt } from '../../lib/setup';
import { useProjectStore } from '../../store/projectStore';
import Card, { fieldInput } from '../ui/Card';
import CopyButton from '../ui/CopyButton';

export default function AudioBriefPanel() {
  const brief = useProjectStore((s) => s.project!.audioBrief);
  const lines = useProjectStore((s) => s.project!.lrcLines);
  const patch = useProjectStore((s) => s.patch);
  const [showPrompt, setShowPrompt] = useState(false);
  const prompt = useMemo(() => extractBriefPrompt(), []);
  const filled = useMemo(() => (prompt ? fillBriefPrompt(prompt, lines) : ''), [prompt, lines]);

  return (
    <Card title="Gemini audio brief" optional>
      <p className="text-xs text-neutral-400">
        Claude can't hear the song. A brief from Gemini describing sections, energy, instruments and where the singing stops
        helps with pacing and lip-sync. Attach your song in the Gemini app, paste this prompt, then paste its answer below.
      </p>
      {prompt && (
        <div className="mt-2">
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={filled} label={lines.length ? 'Copy prompt (with my lyrics)' : 'Copy prompt'} />
            {lines.length > 0 && <CopyButton text={prompt} label="Copy blank prompt" />}
            <button type="button" onClick={() => setShowPrompt((s) => !s)} className="text-xs text-neutral-400 underline hover:text-neutral-200">
              {showPrompt ? 'Hide prompt' : 'Show prompt'}
            </button>
          </div>
          {showPrompt && (
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded border border-neutral-800 bg-neutral-950 p-2 text-xs text-neutral-300">{filled}</pre>
          )}
        </div>
      )}
      <label htmlFor="brief" className="mt-3 block text-xs font-medium text-neutral-400">Paste Gemini's answer</label>
      <textarea
        id="brief"
        rows={7}
        value={brief}
        onChange={(e) => patch({ audioBrief: e.target.value })}
        spellCheck={false}
        className={`${fieldInput} mt-1 font-mono`}
        placeholder="# SONG OVERVIEW ..."
      />
      <p className="mt-1 text-xs text-neutral-500">Your .lrc stays the authority for lyric timing. Singing stop tags are treated as drafts until you check them by ear.</p>
    </Card>
  );
}
