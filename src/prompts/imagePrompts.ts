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

export interface CharacterSheetPromptOptions {
  /** Shown above the panels when labels are on. */
  name: string;
  /** A name and role heading above the panels and a colour-swatch strip below. Off by default: text on a reference can leak into clips. */
  labels?: boolean;
}

/**
 * Asks for one 16:9 reference sheet of the character in the reference image: front three-quarter, side, back and a face close-up.
 * Adapted from a community prompt, with additions for problems seen in practice: parts the reference doesn't show (below the
 * waist) are designed once and kept identical, near-black stays black, skin and age stay as they are, and small ornaments stay.
 */
export function characterSheetPrompt({ name, labels = false }: CharacterSheetPromptOptions): string {
  const header = labels
    ? `ABOVE THE PANELS: the character's name "${name.trim().toUpperCase()}" in bold sans-serif capitals, with the word CHARACTER in small capitals underneath.
BELOW THE PANELS: a strip of five colour swatches, each with a small caption: skin, hair, primary garment, accent, background.`
    : 'NO TEXT: no title, no labels, no captions, no numbers, no colour swatches and no watermark anywhere in the image. Only the four panels on a plain background.';
  return `Using the reference image provided as the source of truth for the character's identity, generate a complete character reference sheet that preserves every detail of the original character.

LAYOUT: a single 16:9 widescreen image with four panels side by side:
1. THREE-QUARTER FRONT VIEW: hero pose, full body, weight on the back foot, natural stance.
2. SIDE PROFILE VIEW: an exact 90-degree side view, full body.
3. BACK VIEW: full body from behind, silhouette readable.
4. FACE CLOSE-UP PANEL: front-facing, collarbone up, neutral expression.
All four panels are evenly spaced, at the same scale and on the same eyeline.

${header}

PRESERVE FROM THE REFERENCE EXACTLY:
- Face: bone structure, eye shape, nose, lips, skin tone, skin texture and apparent age, identical in every panel. Do not add wrinkles or age lines, and keep any face paint or makeup exactly as it is.
- Hair: length, texture, colour and fall direction.
- Outfit: every garment, every detail, fabric behaviour, fit, and every accessory, pin, badge and ornament, however small.
- Colours: keep every colour exactly as in the reference. A black item stays black; do not lighten it to grey or brown.
- Render style: match the treatment, edge quality and texture of the reference.
- Lighting: the same key direction and colour temperature in all four panels.

Where the reference does not show part of the character (for example below the waist or the back), design it plausibly and in keeping with the outfit, then keep it identical in every panel.

BACKGROUND: a clean, plain neutral grey, light or dark to suit the character's tones. No environment.

CONSTRAINTS: do not redesign anything; extend the existing character into new angles. Do not change the art style. The full body is visible in the front, side and back panels, with no cropping.`;
}
