const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** 214 -> "03:34". Fractions are floored. */
export function fmt(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
}

/** 201.3 -> "03:21.30" (lrc style, centiseconds). */
export function fmtPrecise(sec: number): string {
  const cs = Math.round(Math.max(0, sec) * 100);
  const m = Math.floor(cs / 6000);
  const s = Math.floor((cs % 6000) / 100);
  return `${pad(m)}:${pad(s)}.${pad(cs % 100)}`;
}

/**
 * Parses a runtime typed by a person: "3:34", "03:34", "214", "3:34.4".
 * Returns whole seconds, or null if it can't be read.
 */
export function parseTimeInput(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const clock = /^(\d{1,3}):([0-5]?\d)(?:[.,](\d+))?$/.exec(s);
  if (clock) {
    const frac = clock[3] ? Number('0.' + clock[3]) : 0;
    return Math.round(Number(clock[1]) * 60 + Number(clock[2]) + frac);
  }
  if (/^\d+(?:[.,]\d+)?$/.test(s)) return Math.round(Number(s.replace(',', '.')));
  return null;
}
