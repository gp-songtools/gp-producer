import { Link } from 'react-router-dom';
import { setupReadiness } from '../../lib/setup';
import { useAudioStore } from '../../store/audioStore';
import { useProjectStore } from '../../store/projectStore';
import { useSettingsStore } from '../../store/settingsStore';

export default function ReadyChecklist() {
  const project = useProjectStore((s) => s.project!);
  const hasKey = useSettingsStore((s) => !!s.anthropicKey);
  const audioLoaded = useAudioStore((s) => s.projectId === project.id && !!s.url);
  const { items, ready } = setupReadiness({
    lrcLines: project.lrcLines,
    runtimeSec: project.runtimeSec,
    vision: project.vision,
    audioBrief: project.audioBrief,
    hasAnthropicKey: hasKey,
    audioLoaded,
  });

  return (
    <aside className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 lg:sticky lg:top-4" aria-label="Setup checklist">
      <h2 className="text-base font-semibold">Ready for Blueprint?</h2>
      <ul className="mt-3 space-y-2 text-sm">
        {items.map((i) => (
          <li key={i.id} className="flex gap-2">
            <span aria-hidden className={i.done ? 'text-emerald-400' : i.required ? 'text-amber-400' : 'text-neutral-600'}>{i.done ? '✓' : '○'}</span>
            <span>
              <span className={i.done ? 'text-neutral-300' : ''}>{i.label}</span>
              {!i.required && <span className="ml-1 text-xs text-neutral-500">optional</span>}
              {!i.done && i.hint && <span className="block text-xs text-neutral-500">{i.hint}</span>}
            </span>
            <span className="sr-only">{i.done ? 'done' : 'not done'}</span>
          </li>
        ))}
      </ul>
      <Link
        to={`/p/${project.id}/blueprint`}
        className={`mt-4 block rounded px-3 py-2 text-center text-sm font-medium ${ready ? 'bg-accent text-accent-fg' : 'border border-neutral-700 text-neutral-300 hover:bg-neutral-800'}`}
      >
        {ready ? 'Continue to Blueprint' : 'Go to Blueprint anyway'}
      </Link>
    </aside>
  );
}
