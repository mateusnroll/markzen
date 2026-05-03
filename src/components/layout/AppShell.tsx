import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { RichEditor } from "../editor/RichEditor";
import { TabBar } from "./TabBar";
import { Sidebar } from "../filetree/Sidebar";
import { useTabsStore } from "../../store/tabsStore";
import { updateWindowTitle } from "../../lib/fileOperations";
import { confirmCloseWindow } from "../../lib/tabSwitch";
import { repositionTrafficLights } from "../../lib/trafficLights";

interface AppShellProps {
  folderPath: string | null;
}

export function AppShell({ folderPath }: AppShellProps) {
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const activeTab = useTabsStore((s) =>
    s.tabs.find((t) => t.id === s.activeTabId),
  );

  useEffect(() => {
    // macOS resets traffic light positions during initial window display
    // (windowDidBecomeKey). Delay the reposition to run after that layout pass.
    const timer = setTimeout(() => {
      repositionTrafficLights();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (useTabsStore.getState().tabs.length === 0) {
      useTabsStore.getState().addTab();
    }

    const unlisten = getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      const allowed = await confirmCloseWindow();
      if (allowed) {
        getCurrentWindow().destroy();
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    updateWindowTitle();
  }, [activeTabId, activeTab?.filePath, activeTab?.isDirty]);

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {folderPath && <Sidebar />}
      <div className="flex flex-1 flex-col overflow-hidden">
        <TabBar hasSidebar={!!folderPath} />
        <main className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
          <RichEditor />
        </main>
      </div>
    </div>
  );
}
