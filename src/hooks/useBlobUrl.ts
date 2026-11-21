import { useEffect, useState } from 'react';

/** An object URL for a blob, revoked when it changes or the component goes away. Keyed by id so a re-read of the same image doesn't flicker. */
export function useBlobUrl(blob: Blob | null | undefined, id: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return setUrl(null);
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  return blob ? url : null;
}

export const extForMime = (mime: string) => (mime === 'image/jpeg' ? 'jpg' : mime === 'image/webp' ? 'webp' : 'png');
