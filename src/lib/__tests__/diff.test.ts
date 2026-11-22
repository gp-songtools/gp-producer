import { describe, expect, it } from 'vitest';
import { diffWords } from '../diff';

const join = (p: ReturnType<typeof diffWords>, ...types: string[]) => p.filter((x) => types.includes(x.type)).map((x) => x.text).join('');

describe('diffWords', () => {
  it('marks added and removed words and rebuilds both sides', () => {
    const a = 'slow dolly in on the singer';
    const b = 'slow tracking shot on the singer';
    const d = diffWords(a, b);
    expect(join(d, 'same', 'del')).toBe(a);
    expect(join(d, 'same', 'add')).toBe(b);
    expect(d.some((p) => p.type === 'del' && p.text.includes('dolly'))).toBe(true);
    expect(d.some((p) => p.type === 'add' && p.text.includes('tracking'))).toBe(true);
  });
  it('handles identical, empty and huge inputs', () => {
    expect(diffWords('same', 'same')).toEqual([{ type: 'same', text: 'same' }]);
    expect(diffWords('', '')).toEqual([]);
    expect(diffWords('', 'new')).toEqual([{ type: 'add', text: 'new' }]);
    const big = Array.from({ length: 1600 }, (_, i) => `w${i}`).join(' ');
    expect(diffWords(big, big + ' x')).toEqual([{ type: 'del', text: big }, { type: 'add', text: big + ' x' }]);
  });
});
