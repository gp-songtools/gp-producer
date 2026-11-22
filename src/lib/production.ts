import { extForMime } from '../hooks/useBlobUrl';
import { fmt } from './ledger/format';
import { slugSection } from './ledger/fileTag';
import type { Scene } from '../types/blueprint';
import type { ImageRecord } from '../types/project';

/**
 * The scene a `/production/:sceneNo?` URL points at. A missing, non-numeric or unknown number falls back to the first
 * scene, so a stale link never shows an empty deck. Returns null only when there are no scenes.
 */
export function resolveScene<T extends Pick<Scene, 'scene'>>(scenes: T[], param: string | undefined): T | null {
  if (scenes.length === 0) return null;
  const sorted = [...scenes].sort((a, b) => a.scene - b.scene);
  const n = param !== undefined && /^\d+$/.test(param) ? Number(param) : NaN;
  return sorted.find((s) => s.scene === n) ?? sorted[0];
}

/** Scene numbers before and after `current`, or null at either end. */
export function neighbours(scenes: Pick<Scene, 'scene'>[], current: number): { prev: number | null; next: number | null } {
  const nums = scenes.map((s) => s.scene).sort((a, b) => a - b);
  const i = nums.indexOf(current);
  return { prev: i > 0 ? nums[i - 1] : null, next: i >= 0 && i < nums.length - 1 ? nums[i + 1] : null };
}

/** Where on the song timeline the base clip stops and the extension must carry on to. Null for a base-only scene. */
export function extensionTarget(s: Pick<Scene, 'start_sec' | 'base_sec' | 'extension_sec' | 'end_sec'>) {
  if (!s.extension_sec) return null;
  const baseEnd = s.start_sec + s.base_sec;
  return { baseEnd, baseEndLabel: fmt(baseEnd), target: s.end_sec, targetLabel: fmt(s.end_sec) };
}

/** The text copied for the extension prompt's timeline mark, e.g. `Extend +4s: 01:02 to 01:06`. */
export function extensionMarkText(s: Pick<Scene, 'start_sec' | 'base_sec' | 'extension_sec' | 'end_sec'>): string {
  const t = extensionTarget(s);
  return t ? `Extend +${s.extension_sec}s: ${t.baseEndLabel} to ${t.targetLabel}` : '';
}

/** `Hero-Name_ref.png`: a safe download name for an anchor's reference image. */
export function anchorDownloadName(anchorName: string, img: Pick<ImageRecord, 'mime'>): string {
  return `${slugSection(anchorName)}_ref.${extForMime(img.mime)}`;
}

/** True when the key event should drive the deck (not typing in a field, no modifier held). */
export function isDeckKey(e: { key: string; target: EventTarget | null; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  const el = e.target as { tagName?: string; isContentEditable?: boolean } | null;
  const tag = el?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select' || el?.isContentEditable) return false;
  return e.key === 'ArrowLeft' || e.key === 'ArrowRight';
}
