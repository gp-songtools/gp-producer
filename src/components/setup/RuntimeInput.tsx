import { useState } from 'react';
import { fmt, parseTimeInput } from '../../lib/ledger/format';
import { checkRuntime } from '../../lib/setup';
import { useAudioStore } from '../../store/audioStore';
import { useProjectStore } from '../../store/projectStore';
import Card, { fieldInput } from '../ui/Card';

export default function RuntimeInput() {
  const project = useProjectStore((s) => s.project!);
  const patch = useProjectStore((s) => s.patch);
  const audio = useAudioStore();
  const [draft, setDraft] = useState(project.runtimeSec === null ? '' : fmt(project.runtimeSec));

  const parsed = parseTimeInput(draft);
  const check = checkRuntime(parsed, draft.trim() === '' || parsed !== null, project.lrcLines);
  const audioSec = audio.projectId === project.id && audio.duration ? Math.round(audio.duration) : null;

  const commit = (text: string) => {
    setDraft(text);
    patch({ runtimeSec: parseTimeInput(text) });
  };

  return (
    <Card title="Total runtime">
      <div className="flex items-center gap-3">
        <label htmlFor="runtime" className="sr-only">Total song runtime</label>
        <input
          id="runtime"
          value={draft}
          onChange={(e) => commit(e.target.value)}
          inputMode="numeric"
          placeholder="3:34"
          aria-invalid={!check.ok && draft.trim() !== ''}
          className={`${fieldInput} w-28`}
        />
        {audioSec !== null && audioSec !== project.runtimeSec && (
          <button type="button" onClick={() => commit(fmt(audioSec))} className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800">
            Use audio length ({fmt(audioSec)})
          </button>
        )}
      </div>
      <p className={`mt-2 text-xs ${check.ok ? 'text-neutral-400' : draft.trim() ? 'text-red-300' : 'text-neutral-500'}`}>
        {check.ok
          ? `${check.seconds}s. About ${check.scenesLow}–${check.scenesHigh} scenes at 10–15s each.`
          : check.message}
      </p>
      <p className="mt-1 text-xs text-neutral-500">An .lrc shows when the last line starts, not when the song ends, so this is needed.</p>
      {check.ok && audioSec !== null && Math.abs(audioSec - check.seconds) > 3 && (
        <p className="mt-1 text-xs text-amber-300">The loaded audio is {fmt(audioSec)}, which differs from this runtime by more than 3s.</p>
      )}
    </Card>
  );
}
