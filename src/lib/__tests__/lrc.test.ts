import { describe, expect, it } from 'vitest';
import { isBackingVocal, lyricsInRange, parseLrc } from '../lrc';

describe('parseLrc', () => {
  it('parses mm:ss.xx, mm:ss.xxx and mm:ss', () => {
    const { lines } = parseLrc('[00:12.50] a\n[01:02.345] b\n[02:00] c');
    expect(lines).toEqual([
      { t: 12.5, text: 'a' },
      { t: 62.345, text: 'b' },
      { t: 120, text: 'c' },
    ]);
  });

  it('treats one-digit fractions as tenths, not hundredths', () => {
    expect(parseLrc('[00:05.5] x').lines[0].t).toBe(5.5);
  });

  it('expands multiple timestamps on one line and sorts by time', () => {
    const { lines } = parseLrc('[00:30.00][00:10.00] chorus\n[00:20.00] verse');
    expect(lines.map((l) => [l.t, l.text])).toEqual([
      [10, 'chorus'],
      [20, 'verse'],
      [30, 'chorus'],
    ]);
  });

  it('ignores metadata tags and bare timestamps, counts untimed text', () => {
    const r = parseLrc('[ar:Artist]\n[ti:Title]\n[00:01.00]\n[00:02.00] hi\nuntimed line');
    expect(r.lines).toHaveLength(1);
    expect(r.skipped).toBe(1);
  });

  it('applies a positive offset as lyrics appearing sooner', () => {
    const r = parseLrc('[offset:500]\n[00:10.00] x');
    expect(r.offsetSec).toBe(0.5);
    expect(r.lines[0].t).toBe(9.5);
  });

  it('never goes below zero with an offset', () => {
    expect(parseLrc('[offset:5000]\n[00:01.00] x').lines[0].t).toBe(0);
  });

  it('strips enhanced word tags, BOM and CRLF', () => {
    const r = parseLrc('﻿[00:01.00] <00:01.00>hel<00:01.50>lo\r\n[00:02.00] there');
    expect(r.lines.map((l) => l.text)).toEqual(['hello', 'there']);
  });

  it('keeps timed tags like [ECHO] as text', () => {
    expect(parseLrc('[03:21.30] [ECHO]').lines[0]).toEqual({ t: 201.3, text: '[ECHO]' });
  });
});

describe('lyricsInRange / isBackingVocal', () => {
  const lrc = [
    { t: 10, text: 'a' },
    { t: 20, text: 'b' },
    { t: 30, text: 'c' },
  ];
  it('is inclusive of start and exclusive of end', () => {
    expect(lyricsInRange(lrc, 10, 30).map((l) => l.text)).toEqual(['a', 'b']);
  });
  it('detects parenthesized backing vocals', () => {
    expect(isBackingVocal('(ooh)')).toBe(true);
    expect(isBackingVocal('hello (ooh)')).toBe(false);
  });
});
