import { create } from 'zustand';

/** Small app-wide UI state that more than one component needs to reach. */
interface UiState {
  settingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  settingsOpen: false,
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
}));
