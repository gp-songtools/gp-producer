import CopyButton from '../ui/CopyButton';

/** A prompt shown in full with a one-click copy. `extra` holds secondary copy buttons (e.g. the timeline mark). */
export default function PromptPanel({ title, note, text, extra, id }: { title: string; note?: string; text: string; extra?: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={id} className="text-sm font-semibold text-neutral-100">
          {title}
          {note && <span className="ml-2 text-xs font-normal text-neutral-400">{note}</span>}
        </h3>
        <div className="flex items-center gap-1.5">
          {extra}
          <CopyButton text={text} label="Copy prompt" />
        </div>
      </header>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">{text || '(empty)'}</p>
    </section>
  );
}
