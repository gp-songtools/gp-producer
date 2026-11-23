import type { ReactNode } from 'react';

export default function Card({ title, optional, children, aside }: { title: string; optional?: boolean; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">
          {title} {optional && <span className="ml-1 text-xs font-normal text-neutral-500">optional</span>}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export const fieldInput =
  'w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-accent';
export const fieldLabel = 'mb-1 block text-xs font-medium text-neutral-400';
