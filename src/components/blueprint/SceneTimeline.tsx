import type { Issue, Scene } from '../../types/blueprint';
import { fmt } from '../../lib/ledger/format';

export const sceneAnchorId = (n: number) => `scene-${n}`;

export function jumpToScene(n: number) {
  document.getElementById(sceneAnchorId(n))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Proportional bar of the whole runtime. Amber is an extension, red outlines a scene with errors. */
export default function SceneTimeline({ scenes, runtimeSec, byScene }: { scenes: Scene[]; runtimeSec: number; byScene: Map<number, Issue[]> }) {
  const sorted = [...scenes].sort((a, b) => a.start_sec - b.start_sec);
  return (
    <div aria-label="Timeline" className="print:mb-4">
      <div className="print-keep relative flex h-9 overflow-hidden rounded border border-neutral-800 bg-neutral-950">
        {sorted.map((s) => {
          const bad = byScene.get(s.scene)?.some((i) => i.severity === 'error');
          const ext = s.extension_sec ?? 0;
          const total = Math.max(1, s.end_sec - s.start_sec);
          return (
            <button
              key={s.scene}
              type="button"
              onClick={() => jumpToScene(s.scene)}
              title={`Scene ${s.scene}: ${s.section}, ${fmt(s.start_sec)}–${fmt(s.end_sec)}${bad ? ' (has errors)' : ''}`}
              className={`flex min-w-0 border-r border-neutral-950 text-[10px] hover:brightness-125 ${bad ? 'outline outline-2 -outline-offset-2 outline-red-500' : ''}`}
              style={{ width: `${(total / runtimeSec) * 100}%` }}
            >
              <span className="flex flex-1 items-center justify-center bg-neutral-700 text-neutral-200">{s.scene}</span>
              {ext > 0 && <span className="bg-amber-500/80" style={{ width: `${(ext / total) * 100}%` }} />}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-neutral-500">
        <span>00:00</span>
        <span>{fmt(runtimeSec / 2)}</span>
        <span>{fmt(runtimeSec)}</span>
      </div>
    </div>
  );
}
