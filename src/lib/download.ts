/** Saves a blob as a file download. The object URL is released a moment later. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const downloadText = (text: string, filename: string): void => downloadBlob(new Blob([text], { type: 'text/plain;charset=utf-8' }), filename);

/** "My Song (v2)" -> "My-Song-v2". Safe as a folder or file name. */
export function slugName(name: string, fallback = 'project'): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}
