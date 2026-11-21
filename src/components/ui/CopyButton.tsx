import { useEffect, useRef, useState } from 'react';

export default function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
    } catch {
      setState('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 1800);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 ${className}`}
    >
      {state === 'copied' ? 'Copied ✓' : state === 'failed' ? 'Copy failed: select the text' : label}
    </button>
  );
}
