import { describe, expect, it } from 'vitest';
import { readSse } from '../sse';
import { streamResponse } from './fixtures';

const collect = async (text: string, chunk: number) => {
  const out = [];
  for await (const e of readSse(streamResponse(text, chunk).body!)) out.push(e);
  return out;
};

describe('readSse', () => {
  const text = 'event: a\ndata: {"x":1}\n\nevent: b\ndata: {"y":2}\n\n';

  it.each([1, 2, 5, 7, 1000])('parses the same events at chunk size %i', async (n) => {
    expect(await collect(text, n)).toEqual([
      { event: 'a', data: '{"x":1}' },
      { event: 'b', data: '{"y":2}' },
    ]);
  });

  it('handles CRLF, comments, multi-line data and a missing final blank line', async () => {
    const t = ': keep-alive\r\nevent: m\r\ndata: one\r\ndata: two\r\n\r\ndata: tail';
    expect(await collect(t, 3)).toEqual([
      { event: 'm', data: 'one\ntwo' },
      { event: 'message', data: 'tail' },
    ]);
  });

  it('does not split multi-byte characters', async () => {
    const t = 'event: a\ndata: {"t":"café 🎬 日本"}\n\n';
    const [e] = await collect(t, 1);
    expect(JSON.parse(e.data).t).toBe('café 🎬 日本');
  });

  it('ignores blocks with no data', async () => {
    expect(await collect('event: ping\n\n', 4)).toEqual([]);
  });
});
