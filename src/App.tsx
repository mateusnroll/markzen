import { useEffect, useMemo } from "react";
import { AppShell } from "./components/layout/AppShell";
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

  return <AppShell folderPath={folderPath} />;
}
