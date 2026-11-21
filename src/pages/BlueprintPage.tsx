import { Link } from 'react-router-dom';
import AnchorGallery from '../components/blueprint/AnchorGallery';
import LedgerToolbar from '../components/blueprint/LedgerToolbar';
import SceneCard from '../components/blueprint/SceneCard';
import SceneTimeline from '../components/blueprint/SceneTimeline';
import TreatmentPanel from '../components/blueprint/TreatmentPanel';
import ValidationBanner from '../components/blueprint/ValidationBanner';
import { useBlueprintRun } from '../hooks/useBlueprintRun';
import { useLedgerIssues } from '../hooks/useLedgerIssues';
import { setupReadiness } from '../lib/setup';
import { SCENE_RULES } from '../lib/ledger/rules';
import { useProjectStore } from '../store/projectStore';
import { useSettingsStore } from '../store/settingsStore';

export default function BlueprintPage() {
  const project = useProjectStore((s) => s.project!);
  const anchors = useProjectStore((s) => s.anchors);
  const scenes = useProjectStore((s) => s.scenes);
  const hasKey = useSettingsStore((s) => !!s.anthropicKey);
  const effort = useSettingsStore((s) => s.settings.claudeEffort);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const run = useBlueprintRun();
  const { errors, warnings, byScene, forFix } = useLedgerIssues();

  const readiness = setupReadiness({
    lrcLines: project.lrcLines,
    runtimeSec: project.runtimeSec,
    vision: project.vision,
    audioBrief: project.audioBrief,
    hasAnthropicKey: hasKey,
    audioLoaded: false,
  });
  const missing = readiness.items.filter((i) => i.required && !i.done);
  const T = project.runtimeSec;
  const expectedRange: [number, number] | null = T ? [Math.ceil(T / SCENE_RULES.baseMax), Math.floor(T / SCENE_RULES.baseMin)] : null;
  const hasBlueprint = scenes.length > 0 && project.treatment !== null;
  const hasReview = scenes.some((s) => s.needs_review);

  const generate = () => {
    if (hasBlueprint && !window.confirm('Replace the current blueprint with a new one? Prompt changes are lost. Anchor images are kept where the anchor id matches.')) return;
    void run.generate();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {missing.length > 0 && (
        <div className="rounded border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-100">
          <p className="font-medium">Before Claude can write the blueprint:</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {missing.map((m) => <li key={m.id}>{m.label}{m.hint ? `: ${m.hint}` : ''}</li>)}
          </ul>
          <Link to={`/p/${project.id}/setup`} className="mt-2 inline-block text-xs underline">Go to Setup</Link>
        </div>
      )}

      <LedgerToolbar
        phase={run.phase}
        scenesSeen={run.scenesSeen}
        expectedRange={expectedRange}
        scenes={scenes}
        errors={errors}
        hasReview={hasReview}
        canGenerate={missing.length === 0}
        effort={effort}
        onEffort={(e) => updateSettings({ claudeEffort: e })}
        onGenerate={generate}
        onFix={() => void run.fix(forFix)}
        onSnap={() => void run.snap()}
        onCancel={run.cancel}
      />

      {run.error && (
        <div role="alert" className="rounded border border-red-700/60 bg-red-950/30 p-3 text-sm text-red-100">
          <p>{run.error.message}</p>
          {run.error.problems.length > 0 && (
            <ul className="mt-1 list-disc pl-5 font-mono text-xs text-red-200/80">
              {run.error.problems.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          )}
        </div>
      )}
      {run.notice && <p role="status" className="rounded border border-neutral-700 bg-neutral-900 p-3 text-sm text-neutral-200">{run.notice}</p>}

      {!hasBlueprint && run.phase === 'idle' && missing.length === 0 && (
        <p className="rounded border border-neutral-800 p-6 text-center text-neutral-400">
          Claude will write the director's treatment, the reference anchors and a scene-by-scene ledger from your lyrics, runtime and vision.
        </p>
      )}

      {hasBlueprint && T !== null && (
        <>
          <ValidationBanner errors={errors} warnings={warnings} sceneCount={scenes.length} />
          <TreatmentPanel treatment={project.treatment!} />
          <AnchorGallery anchors={anchors} projectId={project.id} />
          <section aria-label="Scene ledger" className="space-y-3">
            <h2 className="text-base font-semibold">Storyboard & scene ledger</h2>
            <SceneTimeline scenes={scenes} runtimeSec={T} byScene={byScene} />
            {scenes.map((s) => (
              <SceneCard key={s.scene} scene={s} anchors={anchors} lrc={project.lrcLines} issues={byScene.get(s.scene) ?? []} />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
