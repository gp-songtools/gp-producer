import { describe, expect, it } from 'vitest';
import { anchorImagePrompt } from '../imagePrompts';

describe('anchorImagePrompt', () => {
  it('keeps the anchor text and adds the output rules', () => {
    const p = anchorImagePrompt('  A weathered keeper at dusk.  ');
    expect(p.startsWith('A weathered keeper at dusk.')).toBe(true);
    expect(p).toMatch(/16:9 widescreen/);
    expect(p).toMatch(/No text, captions, logos or watermarks/);
  });
});
