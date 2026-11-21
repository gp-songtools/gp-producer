import { useBlobUrl } from '../../hooks/useBlobUrl';
import type { ImageRecord } from '../../types/project';

function Thumb({ img, onUse }: { img: ImageRecord; onUse: () => void }) {
  const url = useBlobUrl(img.blob, img.id);
  const when = new Date(img.createdAt).toLocaleString();
  return (
    <button
      type="button"
      onClick={onUse}
      title={`Use this version (${img.source === 'uploaded' ? 'uploaded' : img.model}, ${when})`}
      aria-label={`Use earlier version from ${when}`}
      className="h-10 w-[4.5rem] shrink-0 overflow-hidden rounded border border-neutral-700 bg-black hover:border-amber-400"
    >
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </button>
  );
}

/** Older versions of an image. Clicking one makes it current again. */
export default function ImageHistory({ older, onUse }: { older: ImageRecord[]; onUse: (id: string) => void }) {
  if (older.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="mb-1 text-[11px] text-neutral-500">Earlier versions</p>
      <div className="flex gap-1.5">{older.map((img) => <Thumb key={img.id} img={img} onUse={() => onUse(img.id)} />)}</div>
    </div>
  );
}
