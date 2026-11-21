/** Appended to every image prompt so frames come back clean and widescreen whatever the anchor text says. */
const SUFFIX = 'Render as a single cinematic 16:9 widescreen image. No text, captions, logos or watermarks.';

/** The prompt actually sent for an anchor: its own text plus the output rules. */
export const anchorImagePrompt = (prompt: string): string => `${prompt.trim()}\n\n${SUFFIX}`;
