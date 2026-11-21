import type { LrcLine } from '../types/blueprint';

export interface LrcParseResult {
  lines: LrcLine[];
  /** Offset in seconds that was applied (from an [offset:] tag). */
  offsetSec: number;
  /** Non-empty lines that had no timestamp and were ignored (excluding metadata tags). */
  skipped: number;
}

const STAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const META = /^\[[A-Za-z#]+:[^\]]*\]$/;
const WORD_TAG = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g;

/** Parses .lrc text. Handles [mm:ss], [mm:ss.xx], [mm:ss.xxx], several stamps per line, [offset:ms]. */
export function parseLrc(raw: string): LrcParseResult {
  const lines: LrcLine[] = [];
  let offsetSec = 0;
  let skipped = 0;

  for (const rawLine of raw.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const offsetMatch = /^\[offset:\s*([+-]?\d+)\s*\]$/i.exec(line);
    if (offsetMatch) {
      // Per the LRC convention a positive offset makes lyrics appear sooner.
      offsetSec = Number(offsetMatch[1]) / 1000;
      continue;
    }
    if (META.test(line)) continue;

    const stamps: number[] = [];
    STAMP.lastIndex = 0;
    let m: RegExpExecArray | null;
    let end = 0;
    while ((m = STAMP.exec(line)) && m.index === end) {
      const frac = m[3] ? Number('0.' + m[3]) : 0;
      stamps.push(Number(m[1]) * 60 + Number(m[2]) + frac);
      end = STAMP.lastIndex;
    }
    if (stamps.length === 0) {
      skipped++;
      continue;
    }
    const text = line.slice(end).replace(WORD_TAG, '').replace(/\s+/g, ' ').trim();
    if (!text) continue; // bare timestamp: no lyric
    for (const t of stamps) lines.push({ t, text });
  }

  const adjusted = lines
    .map((l) => ({ ...l, t: Math.max(0, round3(l.t - offsetSec)) }))
    .sort((a, b) => a.t - b.t);
  return { lines: adjusted, offsetSec, skipped };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Lines starting in [start, end). */
export function lyricsInRange(lrc: LrcLine[], start: number, end: number): LrcLine[] {
  return lrc.filter((l) => l.t >= start && l.t < end);
}

/** A line wholly wrapped in parentheses is a backing vocal the on-screen singer shouldn't mouth. */
export function isBackingVocal(text: string): boolean {
  return /^\(.*\)$/.test(text.trim());
}
