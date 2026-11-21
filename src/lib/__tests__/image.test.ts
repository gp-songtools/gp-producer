import { describe, expect, it } from 'vitest';
import { base64ToBlob, blobToBase64, isWidescreen } from '../image';

describe('base64 helpers', () => {
  it('round-trips bytes, including all 256 values', async () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const b64 = await blobToBase64(new Blob([bytes]));
    expect(b64).toBe(Buffer.from(bytes).toString('base64'));
    const back = new Uint8Array(await base64ToBlob(b64, 'image/png').arrayBuffer());
    expect([...back]).toEqual([...bytes]);
  });

  it('handles a multi-megabyte blob without blowing the argument limit', async () => {
    const big = new Uint8Array(3_000_000).map((_, i) => (i * 31) % 251);
    const b64 = await blobToBase64(new Blob([big]));
    expect(b64.length).toBe(Buffer.from(big).toString('base64').length);
    expect(b64.slice(-64)).toBe(Buffer.from(big).toString('base64').slice(-64));
  });

  it('sets the mime type and handles an empty blob', async () => {
    expect(base64ToBlob('AAAA', 'image/webp').type).toBe('image/webp');
    expect(await blobToBase64(new Blob([]))).toBe('');
  });
});

describe('isWidescreen', () => {
  it.each([[1920, 1080, true], [1280, 720, true], [1376, 768, true], [1024, 1024, false], [1080, 1920, false], [1600, 900, true], [1000, 600, false]])(
    '%i x %i -> %s',
    (width, height, want) => expect(isWidescreen({ width, height })).toBe(want),
  );
  it('is false for a zero height', () => expect(isWidescreen({ width: 10, height: 0 })).toBe(false));
});
