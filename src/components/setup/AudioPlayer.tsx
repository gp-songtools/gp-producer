import { useEffect, useRef, useState, type DragEvent } from 'react';
import { fmt, fmtPrecise, parseTimeInput } from '../../lib/ledger/format';
import { isBackingVocal } from '../../lib/lrc';
import { isAudioFile, useAudioStore } from '../../store/audioStore';
import { useProjectStore } from '../../store/projectStore';
import Card, { fieldInput } from '../ui/Card';

export default function AudioPlayer() {
  const project = useProjectStore((s) => s.project!);
  const patch = useProjectStore((s) => s.patch);
  const audio = useAudioStore();
  const mine = audio.projectId === project.id && audio.url !== null;
  const ref = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(0);
  const [jump, setJump] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const activeRef = useRef<HTMLLIElement>(null);

  const lines = project.lrcLines;
  const activeIdx = lines.reduce((acc, l, i) => (l.t <= now ? i : acc), -1);

  useEffect(() => {
    if (!ref.current?.paused) activeRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const take = (f: File | undefined) => {
    if (!f) return;
    if (!isAudioFile(f)) return setError('That doesn\'t look like an audio file (try MP3, WAV, M4A, OGG or FLAC).');
    setError(null);
    setNow(0);
    audio.load(project.id, f);
    patch({ audioFileName: f.name });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    take(e.dataTransfer.files[0]);
  };

  const seek = (t: number, play = true) => {
    const el = ref.current;
    if (!el) return;
    el.currentTime = Math.max(0, t);
    setNow(el.currentTime);
    if (play) void el.play().catch(() => undefined);
  };

  return (
    <Card title="Local audio" optional>
      {!mine ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={`rounded border-2 border-dashed p-6 text-center text-sm ${over ? 'border-accent bg-accent/10' : 'border-neutral-700'}`}
        >
          <p className="text-neutral-300">Drop an MP3 or WAV here to scrub and check timestamps by ear.</p>
          <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 rounded border border-neutral-700 px-3 py-1 text-xs hover:bg-neutral-800">
            Choose file
          </button>
          <input ref={fileRef} type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac" hidden onChange={(e) => take(e.target.files?.[0])} />
          {project.audioFileName && (
            <p className="mt-3 text-xs text-neutral-500">Last used: {project.audioFileName}. Audio isn't saved, so add it again to scrub.</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2 text-xs text-neutral-400">
            <span className="truncate">{audio.name}{audio.duration ? ` · ${fmt(audio.duration)}` : ''}</span>
            <button type="button" onClick={() => audio.clear()} className="rounded border border-neutral-700 px-2 py-1 hover:bg-neutral-800">Remove</button>
          </div>
          <audio
            ref={ref}
            src={audio.url!}
            controls
            className="w-full"
            onLoadedMetadata={(e) => audio.setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => setNow(e.currentTarget.currentTime)}
            onError={() => setError('The browser could not play this file.')}
          />
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const t = parseTimeInput(jump);
              if (t === null) return setError('Enter a time like 1:23 or 83.');
              setError(null);
              seek(t);
            }}
          >
            <label htmlFor="jump" className="text-xs text-neutral-400">Jump to</label>
            <input id="jump" value={jump} onChange={(e) => setJump(e.target.value)} placeholder="1:23" className={`${fieldInput} w-24`} />
            <button type="submit" className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800">Go</button>
            <span className="ml-auto font-mono text-xs text-neutral-500">{fmtPrecise(now)}</span>
          </form>

          {lines.length > 0 && (
            <ul className="max-h-64 divide-y divide-neutral-800/60 overflow-y-auto rounded border border-neutral-800 text-sm" aria-label="Lyrics">
              {lines.map((l, i) => (
                <li key={`${l.t}-${i}`} ref={i === activeIdx ? activeRef : undefined}>
                  <button
                    type="button"
                    onClick={() => seek(l.t)}
                    className={`flex w-full gap-3 px-2 py-1 text-left hover:bg-neutral-800 ${i === activeIdx ? 'bg-accent/15 text-accent' : ''}`}
                  >
                    <span className="font-mono text-xs text-neutral-500">{fmtPrecise(l.t)}</span>
                    <span className={isBackingVocal(l.text) ? 'italic text-neutral-400' : ''}>{l.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
      <p className="mt-2 text-xs text-neutral-500">Kept in this tab's memory only and never sent to Claude. It goes to Google only if you click "Generate with Gemini" in the audio brief.</p>
    </Card>
  );
}
