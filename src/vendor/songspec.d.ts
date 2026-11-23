// Types for the vendored songspec.js (GP Song Tools, v1.1.0). The library is a UMD file: in a browser module it
// registers itself as globalThis.SongSpec, so src/lib/songSpec.ts imports it for the side effect and reads that global.
export interface SongSpecSection {
  id: string;
  heading: string;
  body: string;
  by: string;
  at: string;
  manual: boolean;
  edited: boolean;
  marker: unknown;
  hash: string;
  stale: { id: string; reason: string }[];
}
export interface SongSpecDoc { [key: string]: unknown }
export interface SongSpecIssue { level: 'error' | 'warning'; field: string; message: string }
export interface SongSpecStore {
  load(): string;
  save(text: string): boolean;
  update(fn: (doc: SongSpecDoc) => unknown): string;
  onChange(cb: (text: string) => void): () => void;
}
export interface SongSpecPanel { refresh(): void; say(text: string, cls?: string): void; destroy(): void }
export interface SongSpecApi {
  VERSION: string;
  parse(text: string): SongSpecDoc;
  serialize(doc: SongSpecDoc): string;
  create(): string;
  section(doc: SongSpecDoc, id: string): SongSpecSection | null;
  setSection(doc: SongSpecDoc, id: string, body: string, opts: { by: string; from?: string[]; at?: string }): SongSpecDoc;
  confirmReason(doc: SongSpecDoc, id: string, by: string): string;
  validate(doc: SongSpecDoc): SongSpecIssue[];
  fileName(doc: SongSpecDoc): string;
  download(text: string, name: string): void;
  toolName(id: string): string;
  setting(doc: SongSpecDoc, key: string): string;
  staleNotes(doc: SongSpecDoc, id: string): string[];
  mountPanel(el: HTMLElement, opts?: { onChange?: (doc: SongSpecDoc) => void; open?: boolean }): SongSpecPanel;
  store: SongSpecStore;
}
