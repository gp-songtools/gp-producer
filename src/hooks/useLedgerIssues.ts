import { useMemo } from 'react';
import { needsReviewIssues, toBlueprint, validateBlueprintExtras } from '../lib/blueprint';
import { validateLedger } from '../lib/ledger/validate';
import { useProjectStore } from '../store/projectStore';
import type { Issue } from '../types/blueprint';

export interface LedgerIssues {
  /** Validator findings plus "needs review" warnings. */
  issues: Issue[];
  errors: Issue[];
  warnings: Issue[];
  byScene: Map<number, Issue[]>;
  /** Same as `issues` but with review warnings promoted to errors; this is what "Ask Claude to fix" sends. */
  forFix: Issue[];
}

/** Validates the stored blueprint against the project's lyrics and runtime. Recomputed on any change. */
export function useLedgerIssues(): LedgerIssues {
  const project = useProjectStore((s) => s.project);
  const anchors = useProjectStore((s) => s.anchors);
  const scenes = useProjectStore((s) => s.scenes);

  return useMemo(() => {
    const none = { issues: [], errors: [], warnings: [], byScene: new Map<number, Issue[]>(), forFix: [] };
    if (!project || scenes.length === 0 || project.runtimeSec === null) return none;
    const base = [
      ...validateLedger(scenes, project.runtimeSec, project.lrcLines, new Set(anchors.map((a) => a.id))),
      ...(project.treatment ? validateBlueprintExtras(toBlueprint(project.treatment, anchors, scenes)) : []),
    ];
    const issues = [...base, ...needsReviewIssues(scenes, 'warn')];
    const byScene = new Map<number, Issue[]>();
    for (const i of issues) if (i.scene !== undefined) byScene.set(i.scene, [...(byScene.get(i.scene) ?? []), i]);
    return {
      issues,
      errors: issues.filter((i) => i.severity === 'error'),
      warnings: issues.filter((i) => i.severity === 'warn'),
      byScene,
      forFix: [...base, ...needsReviewIssues(scenes, 'error')],
    };
  }, [project, anchors, scenes]);
}
