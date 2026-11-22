import { useImageStore } from '../../store/imageStore';
import { useSettingsStore } from '../../store/settingsStore';

/** Controls that apply to every image on the page: Draft mode, and how many images this session has generated. */
export default function ImageBar() {
  const usage = useImageStore((s) => s.usage);
  const { settings, geminiKey, updateSettings } = useSettingsStore();
  const { models, draftMode } = settings;
  const entries = Object.entries(usage).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((n, [, c]) => n + c, 0);

  return (
    <div className="no-print flex flex-wrap items-center gap-x-4 gap-y-1 rounded border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-xs">
      <label className="flex cursor-pointer items-center gap-2 text-neutral-200">
        <input type="checkbox" checked={draftMode} onChange={(e) => updateSettings({ draftMode: e.target.checked })} />
        <span className="font-medium">Draft mode</span>
        <span className="text-neutral-500">
          {draftMode ? `Workhorse renders use ${models.draft}. Hero still uses ${models.hero}.` : `Use ${models.draft} for quick, cheap renders.`}
        </span>
      </label>
      <span className="ml-auto text-neutral-400" data-usage>
        {!geminiKey
          ? 'No Gemini key set'
          : total === 0
            ? 'No images generated yet this session'
            : `This session: ${total} image${total === 1 ? '' : 's'} (${entries.map(([m, c]) => `${m} ×${c}`).join(', ')})`}
      </span>
    </div>
  );
}
