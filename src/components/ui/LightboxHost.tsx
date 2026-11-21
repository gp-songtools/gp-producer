import { useEffect, useRef } from 'react';
import { useBlobUrl } from '../../hooks/useBlobUrl';
import { useLightboxStore } from '../../store/lightboxStore';

/** Full-screen image viewer. Esc closes, arrow keys move between images, clicking the backdrop closes. */
export default function LightboxHost() {
  const { items, index, close, next, prev } = useLightboxStore();
  const item = index === null ? null : items[index];
  const url = useBlobUrl(item?.blob, item?.id);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (index === null) return;
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [index === null, close, next, prev]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!item || index === null) return null;
  const many = items.length > 1;
  const nav = 'absolute top-1/2 -translate-y-1/2 rounded-full bg-black/60 px-3 py-2 text-xl text-white hover:bg-black/80';

  return (
    <div role="dialog" aria-modal="true" aria-label={item.title} className="no-print fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/90 p-4" onClick={close}>
      <button ref={closeRef} type="button" onClick={close} aria-label="Close" className="absolute right-3 top-3 rounded bg-black/60 px-3 py-1 text-sm text-white hover:bg-black/80">Close</button>
      {many && <button type="button" aria-label="Previous image" onClick={(e) => { e.stopPropagation(); prev(); }} className={`${nav} left-3`}>‹</button>}
      {many && <button type="button" aria-label="Next image" onClick={(e) => { e.stopPropagation(); next(); }} className={`${nav} right-3`}>›</button>}
      {url && <img src={url} alt={item.title} className="max-h-[80vh] max-w-full rounded object-contain" onClick={(e) => e.stopPropagation()} />}
      <div className="mt-3 text-center text-sm text-neutral-200" onClick={(e) => e.stopPropagation()}>
        <p className="font-medium">{item.title}</p>
        <p className="text-xs text-neutral-400">{item.caption}{many ? ` · ${index + 1} / ${items.length}` : ''}</p>
      </div>
    </div>
  );
}
