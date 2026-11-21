import { useEffect, useState } from 'react';

/** How long a replaced URL stays valid. The browser can ask for an <img>'s old source once more while the new one is swapping in. */
const REVOKE_DELAY_MS = 1000;

/**
 * An object URL for a blob. Keyed by id, so re-reading the same image from storage doesn't flicker. When the image
 * changes (or the component goes away) the old URL is released after a short delay, not immediately: revoking at once
 * made the browser log failed loads for URLs it still wanted for a moment.
 */
export function useBlobUrl(blob: Blob | null | undefined, id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => void setTimeout(() => URL.revokeObjectURL(u), REVOKE_DELAY_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return blob ? url : null;
}

export const extForMime = (mime: string) => (mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png');
