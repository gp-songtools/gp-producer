import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, BlueprintError, isAbort } from '../lib/api/errors';
import { generateBlueprint, makeRunRecord, repairBlueprint, type FlowResult } from '../lib/api/blueprintFlow';
import { toBlueprint } from '../lib/blueprint';
import { snapBoundaries } from '../lib/ledger/normalize';
import { useImageStore } from '../store/imageStore';
import { useProjectStore } from '../store/projectStore';
import { useSettingsStore } from '../store/settingsStore';
import type { Issue } from '../types/blueprint';

export type Phase = 'idle' | 'generating' | 'repairing' | 'fixing';

export interface RunError {
  message: string;
  problems: string[];
}

const toRunError = (e: unknown): RunError | null => {
  if (isAbort(e)) return null;
  if (e instanceof BlueprintError) return { message: e.message, problems: e.problems };
  if (e instanceof ApiError) return { message: e.message, problems: [] };
  return { message: `Something went wrong: ${e instanceof Error ? e.message : String(e)}`, problems: [] };
};

/** Drives blueprint generation, "ask Claude to fix", and boundary snapping for the open project. */
export function useBlueprintRun() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [scenesSeen, setScenesSeen] = useState(0);
  const [error, setError] = useState<RunError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Leaving the tab mid-call cancels it, so a late result can't land in a different project.
  useEffect(() => () => abortRef.current?.abort(), []);

  const start = useCallback(
    async (kind: 'generate' | 'fix', fixIssues: Issue[] = []) => {
      const { project, anchors, scenes, setBlueprint } = useProjectStore.getState();
      const { anthropicKey, settings } = useSettingsStore.getState();
      if (!project || project.runtimeSec === null) return;

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setError(null);
      setNotice(null);
      setScenesSeen(0);
      setPhase(kind === 'generate' ? 'generating' : 'fixing');

      const base = {
        apiKey: anthropicKey,
        model: settings.claudeModel,
        effort: settings.claudeEffort === 'default' ? undefined : settings.claudeEffort,
        inputs: { runtimeSec: project.runtimeSec, lrc: project.lrcLines, vision: project.vision, audioBrief: project.audioBrief },
        signal: ctrl.signal,
        onProgress: (p: { scenes: number }) => setScenesSeen(p.scenes),
        onStatus: (s: 'generating' | 'repairing') => setPhase(s),
      };

      try {
        let result: FlowResult;
        if (kind === 'generate') result = await generateBlueprint(base);
        else {
          if (!project.treatment) return;
          result = await repairBlueprint({ ...base, current: toBlueprint(project.treatment, anchors, scenes), issues: fixIssues });
        }
        if (ctrl.signal.aborted) return;
        await setBlueprint(result.blueprint, makeRunRecord(project.id, result));
        await useImageStore.getState().load(project.id);
        const left = result.issues.filter((i) => i.severity === 'error').length;
        setNotice(
          left > 0
            ? `Claude's ${result.repaired ? 'corrected ' : ''}blueprint still has ${left} problem${left === 1 ? '' : 's'}. See the list below.`
            : result.repaired
              ? 'The first draft failed validation, so Claude corrected it automatically. All checks now pass.'
              : null,
        );
      } catch (e) {
        const re = toRunError(e);
        if (re) setError(re);
        else setNotice('Cancelled.');
      } finally {
        abortRef.current = null;
        setPhase('idle');
      }
    },
    [],
  );

  const generate = useCallback(() => start('generate'), [start]);
  const fix = useCallback((issues: Issue[]) => start('fix', issues), [start]);
  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const snap = useCallback(async () => {
    const { project, scenes, setScenes } = useProjectStore.getState();
    if (!project || project.runtimeSec === null) return;
    setError(null);
    const r = snapBoundaries(scenes, project.runtimeSec);
    if (!r.ok) {
      setNotice(null);
      return setError({ message: r.reason, problems: [] });
    }
    await setScenes(r.scenes);
    setNotice(
      r.reviewScenes.length
        ? `Boundaries snapped. Scene${r.reviewScenes.length === 1 ? '' : 's'} ${r.reviewScenes.join(', ')} changed length, so their prompts need review. "Ask Claude to fix" can rewrite them.`
        : 'Boundaries snapped. No scene lengths changed.',
    );
  }, []);

  return { phase, scenesSeen, error, notice, busy: phase !== 'idle', generate, fix, cancel, snap };
}
