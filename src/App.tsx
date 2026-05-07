import { useEffect, useMemo } from "react";
import { AppShell } from "./components/layout/AppShell";
import { useFileWatcher } from "./hooks/useFileWatcher";
import { setupMenu } from "./lib/setupMenu";
import { useFileSystemStore } from "./store/fileSystemStore";

export function App() {
  const folderPath = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("folder");
  }, []);

  useEffect(() => {
    setupMenu();
  }, []);

  useEffect(() => {
    if (folderPath) {
      useFileSystemStore.getState().setFolderPath(folderPath);
    }
  }, [folderPath]);

  useFileWatcher(folderPath);

  return <AppShell folderPath={folderPath} />;
}
