import { useImageStore } from '../../store/imageStore';
import { useSettingsStore } from '../../store/settingsStore';
import { imagesForOwner } from '../../lib/anchorImages';
import { scenesNeedingFrames } from '../../lib/sceneImages';
import type { Scene } from '../../types/blueprint';
import { anchorOwner, sceneOwner, type StoredAnchor } from '../../types/project';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40';

/** Batch controls for storyboard frames: render the missing ones, or re-render the ones that no longer match. */
export default function FrameToolbar({ scenes, anchors, projectId }: { scenes: Scene[]; anchors: StoredAnchor[]; projectId: string }) {
  const images = useImageStore((s) => s.images);
  const batch = useImageStore((s) => s.frameBatch);
  const { generateFrames, cancelBatch } = useImageStore.getState();
  const geminiKey = useSettingsStore((s) => s.geminiKey);
  const { models, maxAnchorsPerScene } = useSettingsStore((s) => s.settings);

  const missing = scenesNeedingFrames(scenes, anchors, images, maxAnchorsPerScene, 'missing');
  const outdated = scenesNeedingFrames(scenes, anchors, images, maxAnchorsPerScene, 'outdated');
  const withFrame = scenes.filter((s) => imagesForOwner(images, sceneOwner(s.scene)).length > 0).length;
  const anchorsWithoutImage = anchors.filter((a) => imagesForOwner(images, anchorOwner(a.id)).length === 0).length;
  const running = !!batch?.running;

  const start = (todo: typeof missing, what: string) => {
    const note = anchorsWithoutImage > 0 ? `\n\n${anchorsWithoutImage} anchor${anchorsWithoutImage === 1 ? ' has' : 's have'} no image yet, so frames will be made without ${anchorsWithoutImage === 1 ? 'it' : 'them'}. Generate the anchors first for better continuity.` : '';
    if (!window.confirm(`${what} ${todo.length} storyboard frame${todo.length === 1 ? '' : 's'} with ${models.workhorse}? Each is a real image on your Gemini account.${note}`)) return;
    void generateFrames(projectId, todo, anchors);
  };

  return (
    <div className="no-print space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-neutral-500">{withFrame}/{scenes.length} frames</span>
        {running ? (
          <button type="button" onClick={() => cancelBatch('frameBatch')} className={btn}>Cancel</button>
        ) : (
          <>
            <button type="button" onClick={() => start(missing, 'Generate')} disabled={!geminiKey || missing.length === 0} className={btn} title={geminiKey ? undefined : 'Add a Gemini API key in Settings'}>
              Generate missing frames ({missing.length})
            </button>
            {outdated.length > 0 && (
              <button type="button" onClick={() => start(outdated, 'Re-render')} disabled={!geminiKey} className={btn} title="Frames whose prompt or reference anchors have changed since they were made">
                Regenerate outdated ({outdated.length})
              </button>
            )}
          </>
        )}
      </div>
      {running && batch && (
        <p role="status" className="text-xs text-neutral-300">Generating frames: {batch.done + batch.failed} of {batch.total} finished{batch.failed > 0 ? `, ${batch.failed} failed` : ''}…</p>
      )}
      {batch && !batch.running && (
        <p role="status" className="text-xs text-neutral-400">{batch.cancelled ? 'Cancelled. ' : ''}Generated {batch.done} of {batch.total}{batch.failed > 0 ? `; ${batch.failed} failed (see the cards)` : ''}.</p>
      )}
    </div>
  );
}
