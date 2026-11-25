import { useBlobUrl } from '../../hooks/useBlobUrl';
import type { ImageRecord } from '../../types/project';

export type ChipState = 'used' | 'missing' | 'dropped' | 'unknown';

const STATE_STYLE: Record<ChipState, string> = {
  used: 'border-neutral-600 text-neutral-200',
  missing: 'border-dashed border-amber-500/70 text-amber-300',
  dropped: 'border-neutral-700 text-neutral-500',
  unknown: 'border-red-600 text-red-300',
};

const STATE_TITLE: Record<ChipState, string> = {
  used: 'Sent as a reference image',
  missing: 'No image yet, so it is not sent as a reference',
  dropped: 'Over the per-scene reference limit, so it is not sent',
  unknown: 'This anchor does not exist',
};

/** An attached anchor: its thumbnail (if it has an image) and name, styled by whether it will be sent as a reference. */
export default function AnchorChip({ name, image, state, sheet }: { name: string; image?: ImageRecord; state: ChipState; sheet?: boolean }) {
  const url = useBlobUrl(image?.blob, image?.id);
  return (
    <span title={sheet && state === 'used' ? 'Sent as a reference: the character sheet (front, side, back and face views)' : STATE_TITLE[state]} data-chip-state={state} className={`inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2 text-xs ${STATE_STYLE[state]}`}>
      <span className="flex h-[18px] w-8 items-center justify-center overflow-hidden rounded-full bg-black">
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <span className="text-[9px] text-neutral-600">{state === 'unknown' ? '?' : '–'}</span>}
      </span>
      {state === 'unknown' ? `${name} (missing)` : name}
      {sheet && state === 'used' && <span className="text-[10px] text-sky-300" data-sheet-chip>sheet</span>}
    </span>
  );
}
