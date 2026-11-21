/** The only place scene-length limits are defined. */
export const SCENE_RULES = {
  baseMin: 10,
  baseMax: 15, // Google Flow base clip, seconds
  extMin: 3,
  extMax: 4, // one optional extension, seconds
} as const;

/** Shortest and longest total scene length. */
export const MIN_D: number = SCENE_RULES.baseMin;
export const MAX_D: number = SCENE_RULES.baseMax + SCENE_RULES.extMax;

/** Scene counts n for which MIN_D*n <= T <= MAX_D*n. Empty => runtime can't be tiled (only T < 10). */
export function feasibleSceneCounts(T: number): number[] {
  const out: number[] = [];
  for (let n = Math.max(1, Math.ceil(T / MAX_D)); n <= Math.floor(T / MIN_D); n++) out.push(n);
  return out;
}

/** Valid iff base is within the base range and the extension is null or within the extension range. */
export function validSplit(base: number, ext: number | null): boolean {
  const { baseMin, baseMax, extMin, extMax } = SCENE_RULES;
  return (
    Number.isInteger(base) &&
    base >= baseMin &&
    base <= baseMax &&
    (ext === null || (Number.isInteger(ext) && ext >= extMin && ext <= extMax))
  );
}

/**
 * Preferred base/extension split for a total scene length D, or null if D is not achievable.
 * Up to baseMax: base only. Above it: the shortest legal extension (at least extMin).
 */
export function preferredSplit(D: number): { base: number; ext: number | null } | null {
  if (!Number.isInteger(D) || D < MIN_D || D > MAX_D) return null;
  if (D <= SCENE_RULES.baseMax) return { base: D, ext: null };
  const ext = Math.max(SCENE_RULES.extMin, D - SCENE_RULES.baseMax);
  const base = D - ext;
  return validSplit(base, ext) ? { base, ext } : null;
}
