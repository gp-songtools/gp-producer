import { create } from 'zustand';

/** The local audio file lives only in this tab's memory. It is never saved or sent anywhere. */
interface AudioState {
  /** Which project the loaded file belongs to, so it doesn't follow you into another project. */
  projectId: string | null;
  url: string | null;
  name: string | null;
  duration: number | null;
  load: (projectId: string, file: File) => void;
  setDuration: (d: number) => void;
  clear: () => void;
}

export const useAudioStore = create<AudioState>((set, get) => ({
  projectId: null,
  url: null,
  name: null,
  duration: null,
  load: (projectId, file) => {
    const old = get().url;
    if (old) URL.revokeObjectURL(old);
    set({ projectId, url: URL.createObjectURL(file), name: file.name, duration: null });
  },
  setDuration: (duration) => set({ duration }),
  clear: () => {
    const old = get().url;
    if (old) URL.revokeObjectURL(old);
    set({ projectId: null, url: null, name: null, duration: null });
  },
}));

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|flac|opus)$/i;
export const isAudioFile = (f: File) => f.type.startsWith('audio/') || AUDIO_EXT.test(f.name);
