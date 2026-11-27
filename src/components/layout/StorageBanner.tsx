import { useState } from 'react';
import { Link } from 'react-router-dom';
import { downloadBlob } from '../../lib/download';
import { exportProjectArchive } from '../../lib/projectArchive';
import { formatBytes } from '../../lib/storage';
import { useProjectStore } from '../../store/projectStore';
import { usageLevel, useStorageStore } from '../../store/storageStore';

const btn = 'rounded border border-current px-2 py-1 text-xs hover:bg-white/10 disabled:opacity-40';

/**
 * Tells the user when their work isn't being saved (storage full or refused), and warns before it gets that far.
 * Shown on every page, above the content.
 */
export default function StorageBanner({ onOpenSettings }: { onOpenSettings: () => void }) {
  const problem = useStorageStore((s) => s.problem);
  const usage = useStorageStore((s) => s.usage);
  const usageDismissed = useStorageStore((s) => s.usageDismissed);
  const { dismissProblem, dismissUsage } = useStorageStore.getState();
  const projectId = useProjectStore((s) => s.project?.id);
  const [busy, setBusy] = useState<'save' | 'export' | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const retry = async () => {
    setBusy('save');
    setNote(null);
    await useProjectStore.getState().retrySave();
    setBusy(null);
    if (useStorageStore.getState().problem) setNote('Still not saved. Free some space first (Settings, Storage), then try again.');
  };
  const backup = async () => {
    if (!projectId) return;
    setBusy('export');
    setNote(null);
    try {
      const a = await exportProjectArchive(projectId);
      downloadBlob(a.blob, a.filename);
      setNote(`Downloaded ${a.filename}. It has everything that was saved before the problem.`);
    } catch (e) {
      setNote(`Couldn't make a backup: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };

  if (problem) {
    return (
      <div role="alert" data-storage-banner="problem" className="no-print border-b border-red-800/70 bg-red-950/60 px-4 py-2 text-sm text-red-100">
        <p className="font-medium">{problem.message}</p>
        <p className="mt-0.5 text-xs text-red-200/90">
          {problem.kind === 'quota'
            ? 'What you changed is still on screen but only in memory. Make a backup, free some space, then try saving again. Closing this tab now would lose it.'
            : 'What you changed is still on screen but only in memory. If your browser is blocking storage (a private window, or site data turned off), your work cannot be kept here.'}{' '}
          <Link to="/help/your-projects" className="underline">More help</Link>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {projectId && <button type="button" className={btn} disabled={busy !== null} onClick={() => void retry()}>{busy === 'save' ? 'Saving…' : 'Try saving again'}</button>}
          {projectId && <button type="button" className={btn} disabled={busy !== null} onClick={() => void backup()}>{busy === 'export' ? 'Exporting…' : 'Export a backup'}</button>}
          <button type="button" className={btn} onClick={onOpenSettings}>Free space…</button>
          <button type="button" className={btn} onClick={() => { setNote(null); dismissProblem(); }}>Dismiss</button>
          {note && <span role="status" className="text-xs">{note}</span>}
        </div>
      </div>
    );
  }

  const level = usageLevel(usage);
  if (level && usage && !usageDismissed) {
    return (
      <div role="status" data-storage-banner={level} className={`no-print flex flex-wrap items-center gap-2 border-b px-4 py-2 text-sm ${level === 'urgent' ? 'border-red-800/70 bg-red-950/60 text-red-100' : 'border-amber-700/50 bg-amber-950/40 text-amber-100'}`}>
        <span>
          Browser storage is {Math.round(usage.fraction * 100)}% full ({formatBytes(usage.used)} of {formatBytes(usage.quota)}).
          {level === 'urgent' ? ' New work may fail to save.' : ''} Make a backup and delete what you don't need.
        </span>
        <button type="button" className={btn} onClick={onOpenSettings}>Free space…</button>
        <button type="button" className={btn} onClick={dismissUsage}>Dismiss</button>
      </div>
    );
  }
  return null;
}
