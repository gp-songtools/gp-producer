import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { linkTarget } from '../../components/help/Markdown';
import { parseInline, type Inline, parseMarkdown, plain, searchSections, sectionsOf, slugify } from '../markdown';

const guide = readFileSync(join(__dirname, '../../../docs/USER_GUIDE.md'), 'utf8');

describe('slugify', () => {
  it('matches GitHub-style ids', () => {
    expect(slugify('Keys, privacy and safety')).toBe('keys-privacy-and-safety');
    expect(slugify('Validation: red and amber messages')).toBe('validation-red-and-amber-messages');
    expect(slugify('Post: lip-sync files and exports')).toBe('post-lip-sync-files-and-exports');
    expect(slugify('Lyrics (.lrc)')).toBe('lyrics-lrc');
  });
});

describe('parseInline', () => {
  it('reads code, bold, italic and links, nested', () => {
    const t = parseInline('Click **Generate `now`** or *wait*, see [the guide](#quick-start).');
    expect(t.map((x) => x.type)).toEqual(['text', 'bold', 'text', 'italic', 'text', 'link', 'text']);
    expect(plain(t)).toBe('Click Generate now or wait, see the guide.');
    expect((t[5] as { href: string }).href).toBe('#quick-start');
  });
  it('does not treat an asterisk used as a bullet-like character or a stray star as italics', () => {
    expect(plain(parseInline('2 * 3 and a*b'))).toBe('2 * 3 and a*b');
  });
  it('never produces HTML: markup in the text stays text', () => {
    const t = parseInline('<img src=x onerror=alert(1)> and <b>x</b>');
    expect(t.every((x) => x.type === 'text')).toBe(true);
    expect(plain(t)).toContain('<img src=x onerror=alert(1)>');
  });
});

describe('parseMarkdown', () => {
  const blocks = parseMarkdown(['# Title', '', 'First line', 'wrapped.', '', '- one', '- two', '  continued', '', '1. a', '2. b', '', '> **Tip:** careful', '', '```', 'code [x] **y**', '```', '', '| A | B |', '| --- | --- |', '| 1 | **2** |', '', '## Same', '## Same'].join('\n'));
  it('reads each block type', () => {
    expect(blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'list', 'list', 'quote', 'code', 'table', 'heading', 'heading']);
    expect(plain((blocks[1] as unknown as { inline: Inline[] }).inline)).toBe('First line wrapped.');
    expect((blocks[2] as unknown as { items: unknown[] }).items).toHaveLength(2);
    expect(plain((blocks[2] as unknown as { items: Inline[][] }).items[1])).toBe('two continued');
    expect((blocks[3] as unknown as { ordered: boolean }).ordered).toBe(true);
    expect((blocks[5] as unknown as { text: string }).text).toBe('code [x] **y**');
    const t = blocks[6] as unknown as { header: unknown[]; rows: unknown[][] };
    expect(t.header).toHaveLength(2);
    expect(t.rows).toHaveLength(1);
  });
  it('gives repeated headings unique ids', () => {
    expect(blocks.filter((b) => b.type === 'heading').map((b) => (b as { slug: string }).slug)).toEqual(['title', 'same', 'same-1']);
  });
});

describe('links in the guide', () => {
  it('only allows in-guide, http and https targets', () => {
    expect(linkTarget('#quick-start')).toEqual({ kind: 'help', to: '/help/quick-start' });
    expect(linkTarget('https://example.com/x')).toEqual({ kind: 'external', href: 'https://example.com/x' });
    expect(linkTarget('javascript:alert(1)')).toBeNull();
    expect(linkTarget('data:text/html,x')).toBeNull();
    expect(linkTarget('#')).toBeNull();
  });
});

describe('search', () => {
  const sections = sectionsOf(parseMarkdown(guide));
  it('finds sections by words in the title or the text, best match first', () => {
    const hits = searchSections(sections, 'narrator');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].snippet.length).toBeGreaterThan(10);
    expect(searchSections(sections, 'backup').map((h) => h.slug)).toContain('exports-and-backups');
    expect(searchSections(sections, '401').map((h) => h.slug)).toContain('blueprint-and-claude');
  });
  it('needs every word, ignores one-letter words, and handles nothing found', () => {
    expect(searchSections(sections, 'zzzzqqq')).toEqual([]);
    expect(searchSections(sections, 'a')).toEqual([]);
    expect(searchSections(sections, 'narrator zzzzqqq')).toEqual([]);
  });
});

describe('the user guide itself', () => {
  const blocks = parseMarkdown(guide);
  const slugs = new Set(blocks.filter((b) => b.type === 'heading').map((b) => (b as { slug: string }).slug));

  it('has every section the app links to', () => {
    // links from the app: tab help, settings, empty state
    for (const s of ['quick-start', 'setup-tab', 'blueprint-tab', 'production-tab', 'post-lip-sync-files-and-exports', 'keys-privacy-and-safety']) expect(slugs.has(s), s).toBe(true);
  });

  it('every in-guide link points at a real heading', () => {
    const links = [...guide.matchAll(/\]\(#([^)\s]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(3);
    for (const l of links) expect(slugs.has(l), `#${l}`).toBe(true);
  });

  it('every /help/<section> link in the source points at a real heading', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? (f === '__tests__' ? [] : walk(join(d, f))) : /\.tsx?$/.test(f) ? [join(d, f)] : []));
    const found = new Set<string>();
    for (const f of walk(join(__dirname, '../../'))) for (const m of readFileSync(f, 'utf8').matchAll(/\/help\/([a-z0-9-]{3,})/g)) found.add(m[1]);
    const tabMap = readFileSync(join(__dirname, '../../components/layout/TabBar.tsx'), 'utf8');
    for (const m of tabMap.matchAll(/:\s*'([a-z0-9-]+-[a-z0-9-]+)'/g)) found.add(m[1]);
    expect(found.size).toBeGreaterThan(2);
    for (const s of found) expect(slugs.has(s), s).toBe(true);
  });

  it('names controls that really exist in the app', () => {
    // If a button is renamed, the guide has to be updated with it.
    const src = readdirSync(join(__dirname, '../../'), { recursive: true }).filter((f) => /\.tsx?$/.test(String(f)) && !String(f).includes('__tests__')).map((f) => readFileSync(join(__dirname, '../../', String(f)), 'utf8')).join('\n');
    const labels = [
      'Generate blueprint', 'Ask Claude to fix', 'Snap boundaries', 'Generate with Gemini', 'Copy prompt (with my lyrics)', 'Upload .lrc', 'Continue to Blueprint', 'Ready for Blueprint?',
      'Upgrade to Hero', 'Earlier versions', 'Draft mode', 'Generate missing', 'Retry failed', 'Regenerate outdated', 'Print storyboard', 'Revise scene with Claude', 'Ask Claude to revise', 'Accept revision',
      'Undo last revision', 'Copy timeline mark', 'Copy file tag', 'Add tag', 'Until', "I've checked these by ear", 'Download export bundle (.zip)', 'Export whole project (.zip)', 'Import project…', 'Forget keys',
      'Test key & list models', 'Request persistent storage', 'Local audio', 'Paste Gemini&apos;s answer', 'Previous', 'Make character sheet', 'Download sheet', 'Download anchor', 'Regenerate character sheet', 'Remove sheet', 'Add name and colour swatches', 'Use the character sheet as this character',
    ];
    for (const l of labels) {
      const bare = l.replace('&apos;', "'");
      expect(src.includes(bare) || src.includes(l), l).toBe(true);
      expect(guide.includes(bare.replace("Gemini's", "Gemini's")) || ['Previous', 'Retry failed', 'Regenerate outdated', 'Request persistent storage'].includes(l) || guide.includes(l), `guide mentions ${l}`).toBe(true);
    }
  });

  it('is not a stub: a quick start, safety notes, troubleshooting and a glossary', () => {
    for (const s of ['quick-start', 'keys-privacy-and-safety', 'troubleshooting', 'glossary', 'frequently-asked-questions']) expect(slugs.has(s), s).toBe(true);
    expect(guide.length).toBeGreaterThan(15000);
    expect(guide).not.toMatch(/TODO|FIXME|lorem/i);
  });
});
