import { useEffect, useRef, useState } from 'react';
import { SongSpec, readTimedLyrics, setOpenedSpec, sharedTimedLyrics } from '../../lib/songSpec';
import { useProjectStore } from '../../store/projectStore';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

/** Loads the Timed lyrics section of a Song Spec into the LRC box. Read only: nothing is written back to the spec here. */
export default function SongSpecLyrics() {
  const raw = useProjectStore((s) => s.project!.lrcRaw);
  const setLrc = useProjectStore((s) => s.setLrc);
  const fileRef = useRef<HTMLInputElement>(null);
  const [shared, setShared] = useState(() => sharedTimedLyrics());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => SongSpec.store.onChange(() => setShared(sharedTimedLyrics())), []);

  const apply = (found: { lrc: string; by: string } | null, source: string) => {
    if (!found) return setMsg({ ok: false, text: 'This Song Spec has no Timed lyrics yet. Add them in Framecut.' });
    if (raw.trim() && !window.confirm('Replace the lyrics in this project with the Timed lyrics from the Song Spec?')) return;
    setLrc(found.lrc);
    setMsg({ ok: true, text: `Loaded timed lyrics from ${source}, written by ${SongSpec.toolName(found.by) === 'unknown' ? 'hand' : SongSpec.toolName(found.by)}.` });
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setMsg(null);
    if (f.size > 1_000_000) setMsg({ ok: false, text: 'That file is over 1 MB; a Song Spec should be a few KB.' });
    else {
      try {
        const text = await f.text();
        setOpenedSpec(text);
        apply(readTimedLyrics(text), f.name);
      } catch {
        setMsg({ ok: false, text: 'Could not read that file.' });
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="mt-3 border-t border-neutral-800 pt-3">
      <p className="mb-2 text-xs font-medium text-neutral-400">Load timed lyrics from Song Spec</p>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept=".songspec.md,.md" hidden data-testid="songspec-file" onChange={(e) => void onFile(e.target.files?.[0])} />
        <button type="button" onClick={() => fileRef.current?.click()} className={btn}>Open .songspec.md…</button>
        <button
          type="button"
          disabled={!shared}
          title={shared ? undefined : 'No shared Song Spec with Timed lyrics in this browser yet.'}
          onClick={() => apply(sharedTimedLyrics(), 'the shared Song Spec')}
          className={btn}
        >
          Use shared Song Spec
        </button>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-2 text-xs ${msg.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{msg.text}</p>}
    </div>
  );
}
