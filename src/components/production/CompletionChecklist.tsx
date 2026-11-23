import { checklistProgress, itemsFor } from '../../lib/checklist';
import { useProjectStore } from '../../store/projectStore';
import type { Scene } from '../../types/blueprint';

/** Hand-ticked progress for one scene, saved as you go. */
export default function CompletionChecklist({ scene }: { scene: Scene }) {
  const setChecklist = useProjectStore((s) => s.setChecklist);
  const reset = useProjectStore((s) => s.resetChecklist);
  const { done, total, complete } = checklistProgress(scene);

  return (
    <section aria-label="Completion checklist" className={`rounded-lg border p-3 ${complete ? 'border-emerald-700/70 bg-emerald-950/20' : 'border-neutral-800 bg-neutral-900/50'}`}>
      <header className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-100">
          Checklist <span data-progress className={`ml-1 text-xs font-normal ${complete ? 'text-emerald-300' : 'text-neutral-400'}`}>{complete ? 'Scene complete ✓' : `${done} of ${total}`}</span>
        </h3>
        {done > 0 && (
          <button type="button" onClick={() => void reset(scene.scene)} className="rounded border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300 hover:bg-neutral-800">
            Reset
          </button>
        )}
      </header>
      <ul className="mt-2 space-y-1.5">
        {itemsFor(scene).map((i) => (
          <li key={i.key}>
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={scene.checklist?.[i.key] === true}
                onChange={(e) => void setChecklist(scene.scene, i.key, e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-accent"
              />
              <span>
                <span className="text-neutral-100">{i.label}</span>
                <span className="ml-2 text-xs text-neutral-500">{i.hint}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}
