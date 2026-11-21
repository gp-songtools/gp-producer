import { describe, expect, it } from 'vitest';
import { SCENE_RULES } from '../../lib/ledger/rules';
import { sceneSchema, TOOL_INPUT_SCHEMA, TOOL_NAME } from '../../schemas/blueprint';
import { emptyVision } from '../../types/project';
import { buildBlueprintUserMessage, buildRepairMessage, buildRepairUserMessage } from '../blueprintUser';
import { buildSystemPrompt } from '../system';

describe('system prompt', () => {
  const s = buildSystemPrompt();

  it('carries the scene-length rules, including the 10+2 counter-example', () => {
    expect(s).toContain('10-second base with a 2-second extension is NOT possible');
    expect(s).toMatch(/one Google Flow base clip of 10 to 15 seconds/);
    expect(s).toMatch(/extension is 3 or 4 seconds/);
    expect(s).toContain('19 seconds');
    expect(s).toContain('extension_reason');
  });

  it('keeps the skill rules: no pretending to hear audio, lyric authority, lip-sync framing', () => {
    expect(s).toMatch(/cannot hear the audio/);
    expect(s).toMatch(/authority/);
    expect(s).toMatch(/face the largest in frame/);
    expect(s).toMatch(/dissolves, whip pans, strobing/);
    expect(s).toMatch(/ECHO OR DELAY TAIL/);
    expect(s).toMatch(/drafts, not facts/);
  });

  it('tells Claude not to produce lyrics or file tags', () => {
    expect(s).toMatch(/Do not output lyrics/);
    expect(s).toMatch(/Do not write file names/);
  });

  it('names the tool and says the whole response must be that one call (tool choice can\'t be forced)', () => {
    expect(s).toContain(TOOL_NAME);
    expect(s).toMatch(/entire response must be one call to the submit_blueprint tool/);
  });

  it('is built from the same SCENE_RULES the validator uses', () => {
    expect(s).toContain(`${SCENE_RULES.baseMin} to ${SCENE_RULES.baseMax} seconds`);
  });
});

describe('user message', () => {
  const vision = { ...emptyVision(), narrativeArc: '  arc  ', palette: 'cyan' };
  const msg = buildBlueprintUserMessage({ runtimeSec: 214, lrc: [{ t: 12.504, text: 'a' }, { t: 201.3, text: '[ECHO]' }], vision, audioBrief: '   ' });
  const doc = JSON.parse(msg.slice(msg.indexOf('{'), msg.lastIndexOf('}') + 1));

  it('contains runtime, rounded lyric times, trimmed vision and the scene range', () => {
    expect(doc.runtime_sec).toBe(214);
    expect(doc.lyrics_lrc).toEqual([{ t_sec: 12.5, text: 'a' }, { t_sec: 201.3, text: '[ECHO]' }]);
    expect(doc.last_lyric_starts_sec).toBe(201.3);
    expect(doc.thematic_vision.narrative_arc).toBe('arc');
    expect(doc.base_only_scene_count_range).toEqual([15, 21]);
    expect(doc.scene_length_rules.invalid_example).toBe('10s base + 2s extension');
  });

  it('sends a blank audio brief as null and says to cover 0 to runtime', () => {
    expect(doc.gemini_audio_brief).toBeNull();
    expect(msg).toContain('0 to 214 seconds');
  });

  it('includes a real audio brief when given', () => {
    const m = buildBlueprintUserMessage({ runtimeSec: 60, lrc: [], vision, audioBrief: '# SONG OVERVIEW' });
    expect(m).toContain('# SONG OVERVIEW');
    expect(m).toContain('"last_lyric_starts_sec": null');
  });

  it('builds a repair message around the problems', () => {
    expect(buildRepairMessage('- Scene 2 [GAP] x')).toContain('- Scene 2 [GAP] x');
  });

  it('builds a self-contained correction message that quotes the previous submission', () => {
    const m = buildRepairUserMessage('ORIGINAL', { a: 1 }, '- Scene 2 [GAP] x');
    expect(m.startsWith('ORIGINAL')).toBe(true);
    expect(m).toContain('<previous_submission>\n{"a":1}\n</previous_submission>');
    expect(m).toContain('- Scene 2 [GAP] x');
    expect(m).toMatch(/call submit_blueprint/);
  });
});

describe('tool schema stays in step with the zod schema', () => {
  const sceneJson = TOOL_INPUT_SCHEMA.properties.scenes.items;

  it('requires exactly the keys zod defines for a scene', () => {
    expect([...sceneJson.required].sort()).toEqual(Object.keys(sceneSchema.shape).sort());
    expect(Object.keys(sceneJson.properties).sort()).toEqual(Object.keys(sceneSchema.shape).sort());
  });

  it('puts the length rules from SCENE_RULES into the schema the model sees', () => {
    const p = sceneJson.properties;
    expect([p.base_sec.minimum, p.base_sec.maximum]).toEqual([SCENE_RULES.baseMin, SCENE_RULES.baseMax]);
    expect(p.extension_sec.anyOf[0].enum).toEqual([SCENE_RULES.extMin, SCENE_RULES.extMax]);
    expect(p.duration_sec.maximum).toBe(SCENE_RULES.baseMax + SCENE_RULES.extMax);
  });

  it('is a plain object schema with the three top-level parts', () => {
    expect(TOOL_INPUT_SCHEMA.type).toBe('object');
    expect([...TOOL_INPUT_SCHEMA.required]).toEqual(['treatment', 'anchors', 'scenes']);
  });
});
