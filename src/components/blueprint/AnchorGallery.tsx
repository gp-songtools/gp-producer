import { imagesForOwner } from '../../lib/anchorImages';
import { useImageStore } from '../../store/imageStore';
import { useSettingsStore } from '../../store/settingsStore';
import { anchorOwner, type StoredAnchor } from '../../types/project';
import type { AnchorCategory } from '../../types/blueprint';
import Card from '../ui/Card';
import AnchorCard from './AnchorCard';

const GROUPS: { category: AnchorCategory; label: string }[] = [
  { category: 'character', label: 'Character' },
  { category: 'environment', label: 'Environment' },
  { category: 'prop', label: 'Key prop / macro' },
];

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40';

export default function AnchorGallery({ anchors, projectId }: { anchors: StoredAnchor[]; projectId: string }) {
  const images = useImageStore((s) => s.images);
  const jobs = useImageStore((s) => s.jobs);
  const batch = useImageStore((s) => s.batch);
  const { generateMissing, cancelBatch } = useImageStore.getState();
  const geminiKey = useSettingsStore((s) => s.geminiKey);
  const workhorse = useSettingsStore((s) => s.settings.models.workhorse);

  const missing = anchors.filter((a) => imagesForOwner(images, anchorOwner(a.id)).length === 0 && jobs[anchorOwner(a.id)]?.status !== 'running');
  const withImage = anchors.length - anchors.filter((a) => imagesForOwner(images, anchorOwner(a.id)).length === 0).length;

  const start = () => {
    if (!window.confirm(`Generate ${missing.length} image${missing.length === 1 ? '' : 's'} with ${workhorse}? Each is a real image on your Gemini account.`)) return;
    void generateMissing(projectId, missing.map((a) => ({ id: a.id, prompt: a.prompt })));
  };

  return (
    <Card
      title="Visual reference anchors"
      aside={
        <div className="no-print flex items-center gap-2">
          <span className="text-xs text-neutral-500">{withImage}/{anchors.length} with images</span>
          {batch?.running ? (
            <button type="button" onClick={() => cancelBatch('batch')} className={btn}>Cancel</button>
          ) : (
            <button type="button" onClick={start} disabled={!geminiKey || missing.length === 0} className={btn} title={geminiKey ? undefined : 'Add a Gemini API key in Settings'}>
              Generate missing ({missing.length})
            </button>
          )}
        </div>
      }
    >
      {batch?.running && (
        <p role="status" className="mb-3 text-xs text-neutral-300">Generating anchors: {batch.done + batch.failed} of {batch.total} finished{batch.failed > 0 ? `, ${batch.failed} failed` : ''}…</p>
      )}
      {batch && !batch.running && (
        <p role="status" className="mb-3 text-xs text-neutral-400">
          {batch.cancelled ? 'Cancelled. ' : ''}Generated {batch.done} of {batch.total}{batch.failed > 0 ? `; ${batch.failed} failed (see the cards)` : ''}.
        </p>
      )}
      {!geminiKey && <p className="mb-3 text-xs text-amber-300">Add a Gemini API key in Settings to generate images. You can still upload your own.</p>}
      <p className="mb-3 text-xs text-neutral-500">
        Each prompt is standalone and 16:9, so it also works pasted into any image tool. Up to three versions of each image are kept.
      </p>
      <div className="space-y-5">
        {GROUPS.map(({ category, label }) => {
          const group = anchors.filter((a) => a.category === category);
          if (!group.length) return null;
          return (
            <div key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {group.map((a) => <AnchorCard key={a.id} anchor={a} projectId={projectId} siblings={anchors} />)}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
