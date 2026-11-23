import type { Scene } from '../types/blueprint';
import { buildFileTag } from './ledger/fileTag';

export interface ClipFileInfo {
  name: string;
  size: number;
}

export interface ClipMatch {
  scene: number;
  /** Index into the files list. */
  file: number;
  /** `tag`: the name is the scene's file tag; `number`: only the leading scene number agrees. */
  how: 'tag' | 'number';
}

export interface ClipMatches {
  matches: ClipMatch[];
  /** Indexes of files that matched no scene. */
  unmatched: number[];
}

type SceneKey = Pick<Scene, 'scene' | 'section' | 'start_sec' | 'end_sec'>;

const LEADING_NUMBER = /^0*(\d+)[_\s.-]/;

/** Pairs chosen files with scenes: exact file tag first (any case), then the leading scene number. Each file is used once. */
export function matchClipFiles(scenes: SceneKey[], files: ClipFileInfo[]): ClipMatches {
  const used = new Set<number>();
  const done = new Set<number>();
  const matches: ClipMatch[] = [];
  const ordered = [...scenes].sort((a, b) => a.scene - b.scene);

  for (const s of ordered) {
    const tag = buildFileTag(s).toLowerCase();
    const i = files.findIndex((f, idx) => !used.has(idx) && f.name.toLowerCase() === tag);
    if (i >= 0) {
      used.add(i);
      done.add(s.scene);
      matches.push({ scene: s.scene, file: i, how: 'tag' });
    }
  }
  for (const s of ordered) {
    if (done.has(s.scene)) continue;
    const i = files.findIndex((f, idx) => {
      if (used.has(idx)) return false;
      const m = LEADING_NUMBER.exec(f.name);
      return !!m && Number(m[1]) === s.scene;
    });
    if (i >= 0) {
      used.add(i);
      matches.push({ scene: s.scene, file: i, how: 'number' });
    }
  }
  matches.sort((a, b) => a.scene - b.scene);
  return { matches, unmatched: files.map((_, i) => i).filter((i) => !used.has(i)) };
}

export type ClipState = 'none' | 'session' | 'drive' | 'earlier';

/** Where a scene's clip stands: nothing, a file held in this session, on Drive, or only remembered from an earlier session. */
export function clipState(scene: Pick<Scene, 'clip'>, inMemory: boolean): ClipState {
  if (scene.clip?.driveFileId) return 'drive';
  if (inMemory) return 'session';
  return scene.clip ? 'earlier' : 'none';
}

export const CLIP_STATE_TEXT: Record<ClipState, string> = {
  none: 'No clip yet',
  session: 'Clip added (this session)',
  drive: 'On Drive',
  earlier: 'Clip added earlier — add it again to upload',
};
