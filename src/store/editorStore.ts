import { create } from "zustand";

interface EditorState {
  isReady: boolean;
  setReady: (ready: boolean) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  isReady: false,
  setReady: (ready) => set({ isReady: ready }),
}));
