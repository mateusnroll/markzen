import { create } from "zustand";

interface FileState {
  filePath: string | null;
  isDirty: boolean;
  setFilePath: (path: string | null) => void;
  setDirty: (dirty: boolean) => void;
}

export const useFileStore = create<FileState>((set) => ({
  filePath: null,
  isDirty: false,
  setFilePath: (path) => set({ filePath: path }),
  setDirty: (dirty) => set({ isDirty: dirty }),
}));
