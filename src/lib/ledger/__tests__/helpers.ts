import type { Scene } from '../../../types/blueprint';

export function scene(n: number, start: number, end: number, over: Partial<Scene> = {}): Scene {
  const D = end - start;
  return {
    scene: n,
    section: `Sec ${n}`,
    start_sec: start,
    end_sec: end,
    base_sec: Math.min(D, 15),
    extension_sec: D > 15 ? D - 15 : null,
    extension_reason: D > 15 ? 'continuous move must land' : null,
    duration_sec: D,
    anchor_ids: ['character'],
    keyframe_prompt: 'k',
    base_prompt: 'b',
    extension_prompt: D > 15 ? 'e' : null,
    lip_sync: null,
    ...over,
  };
}

/** Four scenes tiling 0..50 (12, 13, 12, 13). */
export const goodLedger = (): Scene[] => [scene(1, 0, 12), scene(2, 12, 25), scene(3, 25, 37), scene(4, 37, 50)];
export const anchors = new Set(['character']);
