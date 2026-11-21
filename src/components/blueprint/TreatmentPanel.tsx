import type { Treatment } from '../../types/blueprint';
import Card from '../ui/Card';

const FACETS: [keyof Treatment['facets'], string][] = [
  ['narrative_metaphor', 'Narrative metaphor'],
  ['visual_symbolism', 'Visual symbolism'],
  ['pacing_arc', 'Pacing arc'],
  ['camera_language', 'Camera language'],
  ['color_progression', 'Color progression'],
];

export default function TreatmentPanel({ treatment }: { treatment: Treatment }) {
  return (
    <Card title={`Director's Treatment: ${treatment.title}`}>
      <div className="space-y-3 text-sm leading-relaxed text-neutral-200">
        {treatment.paragraphs.map((p, i) => <p key={i}>{p}</p>)}
      </div>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2">
        {FACETS.map(([k, label]) => (
          <div key={k} className="rounded border border-neutral-800 bg-neutral-950/60 p-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-amber-400/90">{label}</dt>
            <dd className="mt-0.5 text-xs text-neutral-300">{treatment.facets[k]}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
