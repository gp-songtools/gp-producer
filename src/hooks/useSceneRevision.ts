import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbort, BlueprintError } from '../lib/api/errors';
import { makeRevisionRun, reviseScene, type RevisionResult } from '../lib/api/revisionFlow';
import { ApiError } from '../lib/api/errors';
import * as db from '../lib/db';
import { lyricsInRange } from '../lib/lrc';
import { useProjectStore } from '../store/projectStore';
import { useSettingsStore } from '../store/settingsStore';
import type { Scene } from '../types/blueprint';

export type RevisionPhase = 'idle' | 'asking';

/** Runs the Claude revision for one scene. The result is a proposal; nothing changes until `accept`. */
export function useSceneRevision(scene: Scene) {
  const [phase, setPhase] = useState<RevisionPhase>('idle');
  const [result, setResult] = useState<RevisionResult | null>(null);
  const [request, setRequest] = useState('');
  const [error, setError] = useState<{ message: string; problems: string[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback(
    async (text: string) => {
      const { project, anchors } = useProjectStore.getState();
      const { anthropicKey, settings } = useSettingsStore.getState();
      if (!project) return;
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setError(null);
      setResult(null);
      setRequest(text);
      setPhase('asking');
      try {
        const r = await reviseScene({
          apiKey: anthropicKey,
          model: settings.claudeModel,
          effort: settings.claudeEffort === 'default' ? undefined : settings.claudeEffort,
          signal: ctrl.signal,
          inputs: {
            treatment: project.treatment,
            anchors: scene.anchor_ids.map((id) => anchors.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => !!a).map((a) => ({ id: a.id, name: a.name, prompt: a.prompt })),
            scene,
            lyrics: lyricsInRange(project.lrcLines, scene.start_sec, scene.end_sec),
            request: text,
          },
        });
        if (ctrl.signal.aborted) return;
        void db.addRun(makeRevisionRun(project.id, scene.scene, text, r)).catch(() => undefined);
        setResult(r);
      } catch (e) {
        if (isAbort(e)) return;
        if (e instanceof ApiError) setError({ message: e.message, problems: [] });
        else if (e instanceof BlueprintError) setError({ message: e.message, problems: e.problems });
        else setError({ message: `Something went wrong: ${e instanceof Error ? e.message : String(e)}`, problems: [] });
      } finally {
        abortRef.current = null;
        setPhase('idle');
      }
    },
    [scene],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);
  const clear = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { phase, result, request, error, ask, cancel, clear };
}
