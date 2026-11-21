import type { Vision } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';
import Card, { fieldInput, fieldLabel } from '../ui/Card';

const FIELDS: { key: keyof Vision; label: string; placeholder: string; rows: number }[] = [
  { key: 'narrativeArc', label: 'Narrative arc', placeholder: 'A lighthouse keeper keeps signalling a ship that never arrives, until the light goes out and dawn answers.', rows: 3 },
  { key: 'visualTone', label: 'Visual tone', placeholder: 'Austere and tactile, wet stone, long takes, restrained movement that loosens as the song builds.', rows: 2 },
  { key: 'mood', label: 'Mood', placeholder: 'Lonely, then defiant, then quietly relieved.', rows: 2 },
  { key: 'palette', label: 'Color palette', placeholder: 'Cold cyan shadows with a single amber light source; desaturated until the final chorus.', rows: 2 },
  { key: 'aesthetic', label: 'Film aesthetic', placeholder: '35mm anamorphic, halation on highlights, soft haze, low-key motivated lighting.', rows: 2 },
];

export default function VisionForm() {
  const vision = useProjectStore((s) => s.project!.vision);
  const patch = useProjectStore((s) => s.patch);
  return (
    <Card title="Thematic vision">
      <div className="space-y-3">
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label htmlFor={`vision-${f.key}`} className={fieldLabel}>{f.label}</label>
            <textarea
              id={`vision-${f.key}`}
              rows={f.rows}
              value={vision[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => patch({ vision: { ...vision, [f.key]: e.target.value } })}
              className={fieldInput}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
