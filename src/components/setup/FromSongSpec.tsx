import { useMemo } from 'react';
import { useSharedSpec } from '../../hooks/useSharedSpec';
import { fmt } from '../../lib/ledger/format';
import { mmss, specOffers } from '../../lib/songSpec';
import { useProjectStore } from '../../store/projectStore';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800';
const InUse = () => <span className="text-xs font-medium text-emerald-300">In use</span>;

/** Offers the shared Song Spec's Timed lyrics, Duration and Title to this project. Read only: nothing is written to the spec. */
export default function FromSongSpec() {
  const spec = useSharedSpec();
  const project = useProjectStore((s) => s.project!);
  const patch = useProjectStore((s) => s.patch);
  const setLrc = useProjectStore((s) => s.setLrc);
  const o = useMemo(
    () => specOffers(spec, { lrcRaw: project.lrcRaw, runtimeSec: project.runtimeSec, name: project.name }),
    [spec, project.lrcRaw, project.runtimeSec, project.name],
  );
  if (!o) return null;

  const useLyrics = () => {
    if (!o.timed) return;
    if (project.lrcRaw.trim() && !window.confirm('Replace the lyrics in this project with the Timed lyrics from the song spec?')) return;
    setLrc(o.timed.body);
  };

  const row = 'flex flex-wrap items-center justify-between gap-2';
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4" data-testid="from-songspec">
      <h2 className="text-base font-semibold">From the song spec</h2>
      <p className="mt-1 text-xs text-neutral-400">Optional: use any of these, or ignore them and type your own.</p>
      <div className="mt-3 space-y-2 text-sm">
        {o.timed && (
          <div className={row}>
            <span>Timed lyrics from {o.timed.tool}: {o.timed.count} lines, {fmt(o.timed.first)}–{fmt(o.timed.last)}.</span>
            {o.timed.inUse ? <InUse /> : <button type="button" className={btn} onClick={useLyrics}>Use as lyrics</button>}
          </div>
        )}
        {!o.timed && o.lyricsOnly && (
          <p className="text-xs text-neutral-400">This song spec has lyrics but no timed lyrics yet. Time them in Framecut and press Save Timed Lyrics to Song Spec.</p>
        )}
        {o.duration && (
          <div className={row}>
            <span>Duration: {mmss(o.duration.sec)} (from the song spec).</span>
            {o.duration.inUse ? <InUse /> : <button type="button" className={btn} onClick={() => patch({ runtimeSec: o.duration!.sec })}>Use as runtime</button>}
          </div>
        )}
        {o.title && (
          <div className={row}>
            <span>Title: {o.title.value}.</span>
            {o.title.inUse ? <InUse /> : <button type="button" className={btn} onClick={() => patch({ name: o.title!.value })}>Use as project name</button>}
          </div>
        )}
        {o.stale.map((n) => <p key={n} className="text-xs text-amber-300">{n}</p>)}
      </div>
      {o.usedLabels.length > 0 && (
        <p className="mt-3 text-xs text-emerald-300">This project uses from the song spec: {o.usedLabels.join(', ')}.</p>
      )}
    </section>
  );
}
