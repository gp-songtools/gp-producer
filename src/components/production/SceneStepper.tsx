import { Link, useNavigate } from 'react-router-dom';
import { neighbours } from '../../lib/production';
import type { Scene } from '../../types/blueprint';

const btn = 'rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800';
const off = 'pointer-events-none cursor-not-allowed opacity-40';

/** Previous / Next / jump-to-scene. Arrow keys are wired in the deck, not here. */
export default function SceneStepper({ projectId, scenes, current }: { projectId: string; scenes: Pick<Scene, 'scene' | 'section'>[]; current: number }) {
  const navigate = useNavigate();
  const { prev, next } = neighbours(scenes, current);
  const to = (n: number) => `/p/${projectId}/production/${n}`;
  const sorted = [...scenes].sort((a, b) => a.scene - b.scene);

  return (
    <nav aria-label="Scene stepper" className="no-print flex flex-wrap items-center gap-2">
      <Link to={prev ? to(prev) : '#'} aria-disabled={prev === null} tabIndex={prev === null ? -1 : 0} className={`${btn} ${prev === null ? off : ''}`} title="Previous scene (←)">
        ← Previous
      </Link>
      <label className="flex items-center gap-1.5 text-sm text-neutral-400">
        <span className="sr-only">Jump to scene</span>
        <select value={current} onChange={(e) => navigate(to(Number(e.target.value)))} className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-neutral-200">
          {sorted.map((s) => (
            <option key={s.scene} value={s.scene}>
              {String(s.scene).padStart(2, '0')} · {s.section}
            </option>
          ))}
        </select>
        <span aria-hidden>of {sorted.length}</span>
      </label>
      <Link to={next ? to(next) : '#'} aria-disabled={next === null} tabIndex={next === null ? -1 : 0} className={`${btn} ${next === null ? off : ''}`} title="Next scene (→)">
        Next →
      </Link>
    </nav>
  );
}
