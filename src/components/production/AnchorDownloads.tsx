import { extForMime, useBlobUrl } from '../../hooks/useBlobUrl';
import { imagesForOwner } from '../../lib/anchorImages';
import { anchorDownloadName } from '../../lib/production';
import { useImageStore } from '../../store/imageStore';
import { useLightboxStore } from '../../store/lightboxStore';
import { anchorLightbox } from '../../lib/lightboxItems';
import { anchorOwner, sheetOwner, type ImageRecord, type StoredAnchor } from '../../types/project';

function Tile({ anchor, image, sheet, onZoom }: { anchor: StoredAnchor; image?: ImageRecord; sheet?: ImageRecord; onZoom: () => void }) {
  const url = useBlobUrl(image?.blob, image?.id);
  const sheetUrl = useBlobUrl(sheet?.blob, sheet?.id);
  return (
    <li className="w-44 rounded border border-neutral-800 bg-neutral-950/60 p-1.5" data-anchor={anchor.id}>
      <div className="aspect-video overflow-hidden rounded bg-black">
        {url ? (
          <button type="button" onClick={onZoom} aria-label={`Enlarge ${anchor.name}`} className="h-full w-full cursor-zoom-in">
            <img src={url} alt={anchor.name} className="h-full w-full object-cover" />
          </button>
        ) : (
          <div className="flex h-full items-center justify-center px-1 text-center text-[10px] text-neutral-600">No image yet</div>
        )}
      </div>
      <p className="mt-1 truncate text-xs text-neutral-300" title={anchor.name}>{anchor.name}</p>
      {image && url ? (
        <>
          <a href={url} download={anchorDownloadName(anchor.name, image)} className="mt-1 inline-block rounded border border-neutral-700 px-2 py-0.5 text-[11px] hover:bg-neutral-800">
            {sheet ? 'Download anchor' : `Download .${extForMime(image.mime)}`}
          </a>
          {sheet && sheetUrl && (
            <a href={sheetUrl} download={`${anchorDownloadName(anchor.name, sheet).replace(/_ref\./, '_sheet.')}`} className="mt-1 ml-1 inline-block rounded border border-sky-800 px-2 py-0.5 text-[11px] text-sky-200 hover:bg-neutral-800">
              Download sheet
            </a>
          )}
        </>
      ) : (
        <span className="mt-1 inline-block text-[11px] text-amber-300/90">Generate it on Blueprint</span>
      )}
    </li>
  );
}

/** Reference anchors attached to the scene, each downloadable so they can be uploaded to Google Flow as ingredients. */
export default function AnchorDownloads({ anchorIds, anchors }: { anchorIds: string[]; anchors: StoredAnchor[] }) {
  const images = useImageStore((s) => s.images);
  const openLightbox = useLightboxStore((s) => s.open);
  const attached = anchorIds.map((id) => anchors.find((a) => a.id === id)).filter((a): a is StoredAnchor => !!a);
  const unknown = anchorIds.filter((id) => !anchors.some((a) => a.id === id));

  const zoom = (id: string) => {
    const { items, index } = anchorLightbox(attached, images, id);
    openLightbox(items, index);
  };

  return (
    <section aria-label="Reference anchors">
      <h3 className="text-sm font-semibold text-neutral-200">Reference anchors</h3>
      {attached.length === 0 ? (
        <p className="mt-1 text-xs text-neutral-500">No anchors attached to this scene.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {attached.map((a) => (
            <Tile key={a.id} anchor={a} image={imagesForOwner(images, anchorOwner(a.id))[0]} sheet={imagesForOwner(images, sheetOwner(a.id))[0]} onZoom={() => zoom(a.id)} />
          ))}
        </ul>
      )}
      {unknown.length > 0 && <p className="mt-1 text-xs text-red-300">Unknown anchor id: {unknown.join(', ')}. Fix it on the Blueprint tab.</p>}
    </section>
  );
}
