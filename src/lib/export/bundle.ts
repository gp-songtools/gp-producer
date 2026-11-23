import JSZip from 'jszip';
import { extForMime } from '../../hooks/useBlobUrl';
import type { Scene } from '../../types/blueprint';
import type { BackingMode, TagSpelling, ImageOwner, ImageRecord, Project, StoredAnchor } from '../../types/project';
import { anchorOwner, sceneOwner } from '../../types/project';
import { stripAnchor, stripScene } from '../blueprint';
import { slugName } from '../download';
import type { StopTag } from '../brief';
import { buildFileTag } from '../ledger/fileTag';
import { buildHandoff } from './handoff';
import { buildLyricsFile } from './lyricsFile';
import { buildLedgerMarkdown } from './markdown';

export const HANDOFF_FILENAME = 'lipsync-handoff.txt';
export const LYRICS_FILENAME = 'lyrics-for-lipsync.txt';

export interface BundleInput {
  project: Project;
  anchors: StoredAnchor[];
  scenes: Scene[];
  /** Newest image per owner (see `db.latestImages`). */
  images: Map<ImageOwner, ImageRecord>;
  /** Tags that may be exported (see `usableTags`). */
  tags: StopTag[];
  /** Brief tags held back because they haven't been checked by ear. */
  withheld: number;
  backing: BackingMode;
  /** Defaults to `instrumental`. */
  spelling?: TagSpelling;
}

export interface Bundle {
  blob: Blob;
  filename: string;
  /** Paths inside the zip, for the summary shown to the user. */
  files: string[];
}

/**
 * The export bundle: `{project}/anchors`, `keyframes` (named by file tag), `ledger.json`, `ledger.md`,
 * `lipsync-handoff.txt` and `lyrics-for-lipsync.txt`. Stop tags the user hasn't checked by ear are never included.
 */
export async function buildBundle(i: BundleInput): Promise<Bundle> {
  const root = slugName(i.project.name);
  const zip = new JSZip();
  const folder = zip.folder(root)!;
  const files: string[] = [];
  const add = (path: string, data: string | Uint8Array) => {
    folder.file(path, data);
    files.push(`${root}/${path}`);
  };

  const scenes = [...i.scenes].sort((a, b) => a.scene - b.scene);
  for (const a of [...i.anchors].sort((x, y) => x.order - y.order)) {
    const img = i.images.get(anchorOwner(a.id));
    if (img) add(`anchors/${slugName(a.id, 'anchor')}.${extForMime(img.mime)}`, new Uint8Array(await img.blob.arrayBuffer()));
  }
  for (const s of scenes) {
    const img = i.images.get(sceneOwner(s.scene));
    if (img) add(`keyframes/${buildFileTag(s).replace(/\.mp4$/, '')}.${extForMime(img.mime)}`, new Uint8Array(await img.blob.arrayBuffer()));
  }

  const json = {
    schema_version: 1,
    project: { name: i.project.name, runtime_sec: i.project.runtimeSec },
    treatment: i.project.treatment,
    anchors: i.anchors.map(stripAnchor),
    scenes: scenes.map((s) => ({ ...stripScene(s), file_tag: buildFileTag(s) })),
  };
  add('ledger.json', `${JSON.stringify(json, null, 2)}\n`);
  add('ledger.md', buildLedgerMarkdown({ projectName: i.project.name, runtimeSec: i.project.runtimeSec, treatment: i.project.treatment, anchors: i.anchors, scenes, lrc: i.project.lrcLines }));
  add(HANDOFF_FILENAME, buildHandoff({ projectName: i.project.name, scenes, lrc: i.project.lrcLines, tags: i.tags, withheld: i.withheld }));
  const lyrics = buildLyricsFile(i.project.lrcLines, i.tags, i.backing, i.spelling);
  if (lyrics) add(LYRICS_FILENAME, lyrics);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { blob, filename: `${root}-export.zip`, files };
}
