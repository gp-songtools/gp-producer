import { create } from 'zustand';
import type { LightboxItem } from '../lib/lightboxItems';

interface LightboxState {
  items: LightboxItem[];
  /** null when closed. */
  index: number | null;
  open: (items: LightboxItem[], index: number) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
}

export const useLightboxStore = create<LightboxState>((set, get) => ({
  items: [],
  index: null,
  open: (items, index) => (items.length ? set({ items, index: Math.min(Math.max(0, index), items.length - 1) }) : undefined),
  close: () => set({ index: null, items: [] }),
  next: () => {
    const { index, items } = get();
    if (index !== null && items.length > 1) set({ index: (index + 1) % items.length });
  },
  prev: () => {
    const { index, items } = get();
    if (index !== null && items.length > 1) set({ index: (index - 1 + items.length) % items.length });
  },
}));
