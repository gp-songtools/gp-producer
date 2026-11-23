import { useEffect, useState } from 'react';
import { SongSpec, loadShared } from '../lib/songSpec';

/** The shared Song Spec text ('' when there is none); re-renders when this or another tab changes it. */
export function useSharedSpec(): string {
  const [text, setText] = useState(loadShared);
  useEffect(() => SongSpec.store.onChange(() => setText(loadShared())), []);
  return text;
}
