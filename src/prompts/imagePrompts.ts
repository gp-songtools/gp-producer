/** Appended to every image prompt so frames come back clean and widescreen whatever the anchor text says. */
const SUFFIX = 'Render as a single cinematic 16:9 widescreen image. No text, captions, logos or watermarks.';

/** The prompt actually sent for an anchor: its own text plus the output rules. */
export const anchorImagePrompt = (prompt: string): string => `${prompt.trim()}\n\n${SUFFIX}`;

/**
 * The prompt for a scene's storyboard frame. With references attached, it says to stay consistent with them
 * (the labelled images come first in the request).
 */
export const keyframeImagePrompt = (prompt: string, hasReferences: boolean): string =>
  `${prompt.trim()}\n\nRender as a single cinematic 16:9 widescreen storyboard frame${
    hasReferences ? ', keeping the characters, environment and props consistent with the reference images above' : ''
  }. No text, captions, logos or watermarks.`;
