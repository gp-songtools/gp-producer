import { useEffect, useState } from 'react';
import type { Phase } from '../../hooks/useBlueprintRun';
import { BOUNDARY_CODES } from '../../lib/ledger/validate';
import type { Issue, Scene } from '../../types/blueprint';

const btn = 'rounded border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-40';

function Elapsed({ running }: { running: boolean }) {
  const [s, setS] = useState(0);
  useEffect(() => {
    if (!running) return;
    setS(0);
    const t = setInterval(() => setS((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [running]);
  return <span className="font-mono">{s}s</span>;
}

const PHASE_TEXT: Record<Exclude<Phase, 'idle'>, string> = {
  generating: 'Claude is writing the blueprint',
  repairing: 'Validation failed, so Claude is correcting it',
  fixing: 'Claude is fixing the blueprint',
};

export interface ToolbarProps {
  phase: Phase;
  scenesSeen: number;
  expectedRange: [number, number] | null;
  scenes: Scene[];
  errors: Issue[];
  hasReview: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  onFix: () => void;
  onSnap: () => void;
  onCancel: () => void;
}

export default function LedgerToolbar(p: ToolbarProps) {
  const busy = p.phase !== 'idle';
  const hasBlueprint = p.scenes.length > 0;
  const extended = p.scenes.filter((s) => s.extension_sec).length;
  const boundaryErrors = p.errors.some((e) => BOUNDARY_CODES.includes(e.code));

  return (
    <div className="no-print space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {!busy ? (
          <button type="button" disabled={!p.canGenerate} onClick={p.onGenerate} className={`${btn} border-amber-400 bg-amber-400 font-medium text-black`}>
            {hasBlueprint ? 'Regenerate blueprint' : 'Generate blueprint'}
          </button>
        ) : (
          <button type="button" onClick={p.onCancel} className={`${btn} border-neutral-600 hover:bg-neutral-800`}>Cancel</button>
        )}

        {hasBlueprint && !busy && boundaryErrors && (
          <button type="button" onClick={p.onSnap} className={`${btn} border-neutral-600 hover:bg-neutral-800`}>Snap boundaries</button>
        )}
        {hasBlueprint && !busy && (p.errors.length > 0 || p.hasReview) && (
          <button type="button" onClick={p.onFix} disabled={!p.canGenerate} className={`${btn} border-neutral-600 hover:bg-neutral-800`}>Ask Claude to fix</button>
        )}

        {hasBlueprint && !busy && (
          <span className="ml-auto text-xs text-neutral-400">
            {p.scenes.length} scenes{extended > 0 && ` · ${extended} extended`}
          </span>
        )}
      </div>

      {busy && (
        <div role="status" className="rounded border border-neutral-700 bg-neutral-900 p-3 text-sm">
          <p>
            {PHASE_TEXT[p.phase as Exclude<Phase, 'idle'>]}… <Elapsed running /> · {p.scenesSeen} scene{p.scenesSeen === 1 ? '' : 's'} written
            {p.expectedRange && p.phase === 'generating' && <span className="text-neutral-500"> (expect about {p.expectedRange[0]}–{p.expectedRange[1]})</span>}
          </p>
          <p className="mt-1 text-xs text-neutral-500">Stay on this tab until it finishes. Leaving cancels the request.</p>
        </div>
      )}
    </div>
  );
}
