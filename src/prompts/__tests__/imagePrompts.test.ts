import { describe, expect, it } from 'vitest';
import { anchorImagePrompt, keyframeImagePrompt } from '../imagePrompts';

describe('anchorImagePrompt', () => {
  it('keeps the anchor text and adds the output rules', () => {
    const p = anchorImagePrompt('  A weathered keeper at dusk.  ');
    expect(p.startsWith('A weathered keeper at dusk.')).toBe(true);
    expect(p).toMatch(/16:9 widescreen/);
    expect(p).toMatch(/No text, captions, logos or watermarks/);
  });
});

describe('keyframeImagePrompt', () => {
  it('asks for consistency with the references only when there are some', () => {
    expect(keyframeImagePrompt(' A lamp. ', true)).toMatch(/^A lamp\.\n\n.*storyboard frame, keeping the characters, environment and props consistent with the reference images above\. No text/s);
    const none = keyframeImagePrompt('A lamp.', false);
    expect(none).toMatch(/storyboard frame\. No text, captions, logos or watermarks\./);
    expect(none).not.toMatch(/reference/);
  });
});
