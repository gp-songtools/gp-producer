import { useMemo, useRef, useState } from 'react';
import { fmt } from '../../lib/ledger/format';
import { parseLrc } from '../../lib/lrc';
import { useProjectStore } from '../../store/projectStore';
import Card, { fieldInput } from '../ui/Card';

export default function LrcInput() {
  const raw = useProjectStore((s) => s.project!.lrcRaw);
  const runtimeSec = useProjectStore((s) => s.project!.runtimeSec);
  const setLrc = useProjectStore((s) => s.setLrc);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const parsed = useMemo(() => parseLrc(raw), [raw]);
  const { lines } = parsed;
  const pastEnd = runtimeSec ? lines.filter((l) => l.t >= runtimeSec).length : 0;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setFileError(null);
    if (f.size > 1_000_000) return setFileError('That file is over 1 MB; an .lrc should be a few KB.');
    try {
      setLrc(await f.text());
    } catch {
      setFileError('Could not read that file.');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <Card
      title="Lyrics (.lrc)"
      aside={
        <>
          <input ref={fileRef} type="file" accept=".lrc,.txt,text/plain" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          <button type="button" onClick={() => fileRef.current?.click()} className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800">
            Upload .lrc
          </button>
        </>
      }
    >
      <label htmlFor="lrc" className="sr-only">Timestamped lyrics</label>
      <textarea
        id="lrc"
        value={raw}
        onChange={(e) => setLrc(e.target.value)}
        rows={9}
        spellCheck={false}
        placeholder={'[00:12.50] First line of the song\n[00:17.80] Second line\n[03:21.30] [ECHO]'}
        className={`${fieldInput} font-mono`}
      />
      <div className="mt-2 space-y-1 text-xs">
        {lines.length > 0 ? (
          <p className="text-neutral-400">
            {lines.length} timed lines, from {fmt(lines[0].t)} to {fmt(lines[lines.length - 1].t)}.
            {parsed.offsetSec !== 0 && ` Offset of ${parsed.offsetSec > 0 ? '+' : ''}${parsed.offsetSec}s applied.`}
          </p>
        ) : raw.trim() ? (
          <p className="text-amber-300">No timestamps found. Lines should look like [mm:ss.xx] lyric.</p>
        ) : (
          <p className="text-neutral-500">Paste your .lrc or upload it. Lyric timing here is treated as the authority.</p>
        )}
        {parsed.skipped > 0 && <p className="text-amber-300">{parsed.skipped} line(s) without a timestamp were ignored.</p>}
        {pastEnd > 0 && <p className="text-red-300">{pastEnd} line(s) start at or after the runtime below.</p>}
        {fileError && <p role="alert" className="text-red-300">{fileError}</p>}
      </div>
    </Card>
  );
}
