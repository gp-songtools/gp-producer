import type { StoredAnchor } from '../../types/project';
import type { AnchorCategory } from '../../types/blueprint';
import Card from '../ui/Card';
import CopyButton from '../ui/CopyButton';

const GROUPS: { category: AnchorCategory; label: string }[] = [
  { category: 'character', label: 'Character' },
  { category: 'environment', label: 'Environment' },
  { category: 'prop', label: 'Key prop / macro' },
];

export default function AnchorGallery({ anchors }: { anchors: StoredAnchor[] }) {
  return (
    <Card title="Visual reference anchors" aside={<span className="text-xs text-neutral-500">{anchors.length} anchors</span>}>
      <p className="mb-3 text-xs text-neutral-500">
        Each prompt is standalone and 16:9, so it works pasted into any image tool. Image generation arrives in the next milestone.
      </p>
      <div className="space-y-5">
        {GROUPS.map(({ category, label }) => {
          const group = anchors.filter((a) => a.category === category);
          if (!group.length) return null;
          return (
            <div key={category}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</h3>
              <div className="grid gap-3 md:grid-cols-2">
                {group.map((a) => (
                  <article key={a.id} data-anchor={a.id} className="rounded border border-neutral-800 bg-neutral-950/60 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-medium">{a.name}</h4>
                      <CopyButton text={a.prompt} label="Copy prompt" />
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">{a.prompt}</p>
                  </article>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
