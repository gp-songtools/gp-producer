import type { Job } from '../../store/imageStore';

/** An image job's failure. "Blocked" is Gemini declining (a retry or another model can differ); other errors are usually transient. */
export default function ImageError({ job, onRetry, onDismiss }: { job: Extract<Job, { status: 'error' }>; onRetry: () => void; onDismiss: () => void }) {
  const blocked = job.kind === 'blocked';
  return (
    <div role="alert" data-error-kind={job.kind} className={`mt-2 rounded border p-2 text-xs ${blocked ? 'border-amber-700/60 bg-amber-950/30 text-amber-100' : 'border-red-800/60 bg-red-950/30 text-red-200'}`}>
      {blocked && <p className="font-medium">Gemini wouldn't make this image.</p>}
      <p>{job.message}</p>
      {blocked && <p className="mt-1 text-amber-200/80">Trying again sometimes works. The Hero model is also worth a try.</p>}
      <div className="mt-1.5 flex gap-2">
        {job.kind !== 'upload' && <button type="button" onClick={onRetry} className="rounded border border-neutral-600 px-2 py-0.5 hover:bg-neutral-800">Try again</button>}
        <button type="button" onClick={onDismiss} className="underline">Dismiss</button>
      </div>
    </div>
  );
}
