import type { Issue } from '../../types/blueprint';
import { jumpToScene } from './SceneTimeline';

export default function ValidationBanner({ errors, warnings, sceneCount }: { errors: Issue[]; warnings: Issue[]; sceneCount: number }) {
  if (errors.length === 0 && warnings.length === 0)
    return (
      <p role="status" className="rounded border border-emerald-700/50 bg-emerald-950/30 p-3 text-sm text-emerald-200">
        ✓ Timestamps check out: {sceneCount} scenes tile the runtime with no gaps or overlaps, and every length is legal.
      </p>
    );

  const row = (i: Issue, idx: number) => (
    <li key={`${i.code}-${i.scene ?? 'g'}-${idx}`} className="flex gap-2">
      <span className={i.severity === 'error' ? 'text-red-400' : 'text-amber-400'} aria-hidden>{i.severity === 'error' ? '✕' : '!'}</span>
      <span>
        {i.scene !== undefined && (
          <button type="button" onClick={() => jumpToScene(i.scene!)} className="mr-1 underline hover:text-white">Scene {i.scene}</button>
        )}
        <span className="font-mono text-[11px] text-neutral-500">{i.code}</span> {i.message}
      </span>
    </li>
  );

  return (
    <div role="alert" className={`rounded border p-3 text-sm ${errors.length ? 'border-red-700/60 bg-red-950/30 text-red-100' : 'border-amber-700/50 bg-amber-950/30 text-amber-100'}`}>
      <p className="font-medium">
        {errors.length > 0 && `${errors.length} error${errors.length === 1 ? '' : 's'}`}
        {errors.length > 0 && warnings.length > 0 && ', '}
        {warnings.length > 0 && `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`}
      </p>
      <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto text-xs">
        {errors.map(row)}
        {warnings.map(row)}
      </ul>
    </div>
  );
}
