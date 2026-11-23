import JSZip from 'jszip';
import { extForMime } from '../../hooks/useBlobUrl';
import { ARCHIVE_FORMAT, ARCHIVE_VERSION, type Archive } from '../../schemas/archive';
import type { Scene } from '../../types/blueprint';
import type { ImageRecord, Project, RunRecord, StoredAnchor } from '../../types/project';
import { slugName } from '../download';
import { parseStopTags, stopTagSignature, usableTags } from '../brief';
import { stripAnchor } from '../blueprint';
import { buildFileTag } from '../ledger/fileTag';
import { buildHandoff } from './handoff';
import { HANDOFF_FILENAME, LYRICS_FILENAME } from './bundle';
import { buildLyricsFile } from './lyricsFile';
import { buildLedgerMarkdown } from './markdown';

export interface ArchiveInput {
  project: Project;
  anchors: StoredAnchor[];
  scenes: Scene[];
  /** Every stored version of every image. */
  images: ImageRecord[];
  runs: RunRecord[];
}

export interface ProjectArchive {
  blob: Blob;
  filename: string;
  imageCount: number;
}

/**
 * The full-project file: everything needed to restore the project as a new one (`project.json`, every image version under
 * `images/`), plus the readable `ledger.md` and the two lip-sync text files so it is useful when opened by hand.
 * The audio file and API keys are never included.
 */
export async function buildProjectArchive(i: ArchiveInput): Promise<ProjectArchive> {
  const root = `${slugName(i.project.name)}-project`;
  const zip = new JSZip();
  const folder = zip.folder(root)!;
  const scenes = [...i.scenes].sort((a, b) => a.scene - b.scene);

  const meta: Archive = {
    format: ARCHIVE_FORMAT,
    version: ARCHIVE_VERSION,
    exportedAt: Date.now(),
    project: {
      name: i.project.name,
      runtimeSec: i.project.runtimeSec,
      lrcRaw: i.project.lrcRaw,
      ...(i.project.audioFileName ? { audioFileName: i.project.audioFileName } : {}),
      vision: i.project.vision,
      audioBrief: i.project.audioBrief,
      treatment: i.project.treatment,
      ...(i.project.stopTagsChecked ? { stopTagsChecked: i.project.stopTagsChecked } : {}),
      ...(i.project.manualTags ? { manualTags: i.project.manualTags } : {}),
      ...(i.project.backingMode ? { backingMode: i.project.backingMode } : {}),
      ...(i.project.tagSpelling ? { tagSpelling: i.project.tagSpelling } : {}),
    },
    anchors: [...i.anchors].sort((a, b) => a.order - b.order).map((a, order) => ({ ...stripAnchor(a), order })),
    scenes: scenes.map(({ projectId: _p, ...s }: Scene & { projectId?: string }) => (void _p, s)),
    images: i.images.map((im) => ({
      id: im.id,
      ownerKey: im.ownerKey,
      kind: im.kind,
      mime: im.mime as Archive['images'][number]['mime'],
      width: im.width,
      height: im.height,
      model: im.model,
      prompt: im.prompt,
      source: im.source,
      ...(im.refImageIds ? { refImageIds: im.refImageIds } : {}),
      createdAt: im.createdAt,
    })),
    runs: i.runs.map((r) => ({ id: r.id, kind: r.kind, createdAt: r.createdAt, payload: r.payload, ...(r.usage !== undefined ? { usage: r.usage } : {}) })),
  };
  folder.file('project.json', `${JSON.stringify(meta)}\n`);
  for (const im of i.images) folder.file(`images/${im.id}.${extForMime(im.mime)}`, new Uint8Array(await im.blob.arrayBuffer()));

  const briefTags = parseStopTags(i.project.audioBrief);
  const checked = briefTags.length > 0 && i.project.stopTagsChecked === stopTagSignature(briefTags);
  const manual = (i.project.manualTags ?? []).map((m) => ({ ...m, source: 'manual' as const }));
  const tags = usableTags(briefTags, manual, checked);
  folder.file('ledger.md', buildLedgerMarkdown({ projectName: i.project.name, runtimeSec: i.project.runtimeSec, treatment: i.project.treatment, anchors: i.anchors, scenes, lrc: i.project.lrcLines }));
  folder.file(HANDOFF_FILENAME, buildHandoff({ projectName: i.project.name, scenes, lrc: i.project.lrcLines, tags, withheld: checked ? 0 : briefTags.length }));
  const lyrics = buildLyricsFile(i.project.lrcLines, tags, i.project.backingMode ?? 'tag', i.project.tagSpelling ?? 'instrumental');
  if (lyrics) folder.file(LYRICS_FILENAME, lyrics);
  // A readable index of which image file is which, since the names are ids.
  const index = i.images
    .map((im) => `images/${im.id}.${extForMime(im.mime)}\t${im.ownerKey}\t${im.source === 'uploaded' ? 'uploaded' : im.model}\t${new Date(im.createdAt).toISOString()}${im.ownerKey.startsWith('scene:') ? `\t${buildFileTag(scenes.find((s) => `scene:${s.scene}` === im.ownerKey) ?? { scene: 0, section: '', start_sec: 0, end_sec: 0 })}` : ''}`)
    .join('\n');
  if (index) folder.file('images/INDEX.txt', `${index}\n`);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  return { blob, filename: `${root}.zip`, imageCount: i.images.length };
}
