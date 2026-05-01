import { useEffect } from "react";
import { RichEditor } from "../editor/RichEditor";
import { TabBar } from "./TabBar";
import { useTabsStore } from "../../store/tabsStore";
import { updateWindowTitle } from "../../lib/fileOperations";

export function AppShell() {
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const activeTab = useTabsStore((s) =>
    s.tabs.find((t) => t.id === s.activeTabId),
  );

  useEffect(() => {
    if (useTabsStore.getState().tabs.length === 0) {
      useTabsStore.getState().addTab();
    }
  }, []);

  useEffect(() => {
    updateWindowTitle();
  }, [activeTabId, activeTab?.filePath, activeTab?.isDirty]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <TabBar />
      <main className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
        <RichEditor />
      </main>
    </div>
  );
}
