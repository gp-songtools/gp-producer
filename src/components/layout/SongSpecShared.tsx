import { useEffect, useRef } from 'react';
import { SongSpec } from '../../lib/songSpec';

/** The GP Song Tools shared "Song spec" panel (from the vendored library), closed by default. */
export default function SongSpecShared() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const panel = SongSpec.mountPanel(el, { open: false });
    return () => panel.destroy();
  }, []);
  return <div ref={ref} className="spec-panel mb-4 mx-auto max-w-6xl" data-testid="songspec-shared" />;
}
