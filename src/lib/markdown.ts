/** A deliberately small Markdown reader for the user guide: headings, paragraphs, lists, tables, code and quotes. No raw HTML. */

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'code'; text: string }
  | { type: 'bold'; children: Inline[] }
  | { type: 'italic'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string; slug: string; inline: Inline[] }
  | { type: 'paragraph'; inline: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'code'; text: string }
  | { type: 'quote'; inline: Inline[] }
  | { type: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { type: 'rule' };

/** GitHub-style heading id: lower case, punctuation dropped, spaces to hyphens. */
export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-');
}

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(\[[^\]]+\]\([^)\s]+\))/;

export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let rest = src;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push({ type: 'text', text: rest });
      break;
    }
    if (m.index > 0) out.push({ type: 'text', text: rest.slice(0, m.index) });
    const tok = m[0];
    if (m[1]) out.push({ type: 'code', text: tok.slice(1, -1) });
    else if (m[2]) out.push({ type: 'bold', children: parseInline(tok.slice(2, -2)) });
    else if (m[3]) out.push({ type: 'italic', children: parseInline(tok.slice(1, -1)) });
    else {
      const lm = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok)!;
      out.push({ type: 'link', href: lm[2], children: parseInline(lm[1]) });
    }
    rest = rest.slice(m.index + tok.length);
  }
  return out;
}

/** The text of inline content with the formatting removed. */
export const plain = (inl: Inline[]): string => inl.map((i) => (i.type === 'text' || i.type === 'code' ? i.text : plain(i.children))).join('');

const splitRow = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
const isTableSep = (line: string) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

export function parseMarkdown(md: string): Block[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  const seen = new Map<string, number>();
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = /^```/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence
      blocks.push({ type: 'code', text: body.join('\n') });
      continue;
    }

    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const text = plain(parseInline(h[2].trim()));
      const base = slugify(text);
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      blocks.push({ type: 'heading', level: h[1].length as 1 | 2 | 3 | 4, text, slug: n === 0 ? base : `${base}-${n}`, inline: parseInline(h[2].trim()) });
      i++;
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) { blocks.push({ type: 'rule' }); i++; continue; }

    if (line.includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const header = splitRow(line).map(parseInline);
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim()) rows.push(splitRow(lines[i++]).map(parseInline));
      blocks.push({ type: 'table', header, rows });
      continue;
    }

    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) body.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push({ type: 'quote', inline: parseInline(body.join(' ')) });
      continue;
    }

    const li = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(line);
    if (li) {
      const ordered = /\d/.test(li[2]);
      const items: Inline[][] = [];
      while (i < lines.length) {
        const m = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(lines[i]);
        if (m && /\d/.test(m[2]) === ordered) {
          let text = m[3];
          i++;
          // a wrapped continuation line is indented and is not itself a list item or blank
          while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !/^\s*([-*]|\d+\.)\s+/.test(lines[i])) text += ` ${lines[i++].trim()}`;
          items.push(parseInline(text));
        } else break;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>\s?|\s*([-*]|\d+\.)\s+)/.test(lines[i]) && !(lines[i].includes('|') && i + 1 < lines.length && isTableSep(lines[i + 1]))) para.push(lines[i++].trim());
    blocks.push({ type: 'paragraph', inline: parseInline(para.join(' ')) });
  }
  return blocks;
}

export interface Section {
  slug: string;
  title: string;
  level: 1 | 2 | 3 | 4;
  /** Plain text of everything under the heading, up to the next heading. */
  text: string;
}

const blockText = (b: Block): string =>
  b.type === 'paragraph' || b.type === 'quote' ? plain(b.inline)
  : b.type === 'list' ? b.items.map(plain).join(' ')
  : b.type === 'table' ? [...b.header, ...b.rows.flat()].map(plain).join(' ')
  : b.type === 'code' ? b.text
  : '';

/** The guide split at its headings, for the table of contents and search. */
export function sectionsOf(blocks: Block[]): Section[] {
  const out: Section[] = [];
  for (const b of blocks) {
    if (b.type === 'heading') out.push({ slug: b.slug, title: b.text, level: b.level, text: '' });
    else if (out.length) out[out.length - 1].text += `${blockText(b)} `;
  }
  return out;
}

export interface SearchHit {
  slug: string;
  title: string;
  snippet: string;
}

/** Sections containing every word of the query (title matches first), each with a snippet around the first hit. */
export function searchSections(sections: Section[], query: string, limit = 8): SearchHit[] {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return [];
  const scored: { s: Section; score: number; at: number }[] = [];
  for (const s of sections) {
    const title = s.title.toLowerCase();
    const body = s.text.toLowerCase();
    if (!words.every((w) => title.includes(w) || body.includes(w))) continue;
    const score = words.reduce((n, w) => n + (title.includes(w) ? 3 : 0) + Math.min(3, body.split(w).length - 1), 0);
    scored.push({ s, score, at: Math.max(0, body.indexOf(words.find((w) => body.includes(w)) ?? '')) });
  }
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ s, at }) => ({ slug: s.slug, title: s.title, snippet: `${at > 40 ? '…' : ''}${s.text.slice(Math.max(0, at - 40), at + 110).trim()}…` }));
}
