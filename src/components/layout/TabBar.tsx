import { useTabsStore } from "../../store/tabsStore";
import { editorRef } from "../../lib/editorRef";
import { switchTab, closeTabAndFocus } from "../../lib/tabSwitch";
import { extractFilename } from "../../lib/fileOperations";
import type { Tab } from "../../types/tab";

function TabItem({
  tab,
  isActive,
  onActivate,
  onClose,
}: {
  tab: Tab;
  isActive: boolean;
  onActivate: () => void;
  onClose: (e: React.MouseEvent) => void;
}) {
  const label = tab.filePath ? extractFilename(tab.filePath) : "Untitled";

  return (
    <button
      className={`group flex h-full items-center gap-1.5 border-r border-[var(--color-border)] px-3 text-xs transition-colors ${
        isActive
          ? "bg-[var(--color-bg)] text-[var(--color-text)]"
          : "bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-bg)]/50"
      }`}
      onClick={onActivate}
    >
      <span className="max-w-[140px] truncate">{label}</span>
      <span className="flex h-4 w-4 items-center justify-center">
        {tab.isDirty ? (
          <span
            className="block h-2 w-2 rounded-full bg-[var(--color-text-muted)] group-hover:hidden"
            aria-label="Unsaved changes"
          />
        ) : null}
        <button
          className={`h-4 w-4 rounded text-[10px] leading-none text-[var(--color-text-muted)] hover:bg-[var(--color-border)] hover:text-[var(--color-text)] ${
            tab.isDirty ? "hidden group-hover:inline-flex" : "invisible group-hover:visible"
          } items-center justify-center`}
          onClick={onClose}
          aria-label={`Close ${label}`}
        >
          ×
        </button>
      </span>
    </button>
  );
}

export function TabBar() {
  const tabs = useTabsStore((s) => s.tabs);
  const activeTabId = useTabsStore((s) => s.activeTabId);
  const handleActivate = (tabId: string) => {
    if (tabId === activeTabId || !editorRef.current || !activeTabId) return;
    switchTab(editorRef.current, activeTabId, tabId);
  };

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    if (!editorRef.current) return;
    closeTabAndFocus(editorRef.current, tabId);
  };

  return (
    <div
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-surface)]"
      data-tauri-drag-region
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          onActivate={() => handleActivate(tab.id)}
          onClose={(e) => handleClose(e, tab.id)}
        />
      ))}
    </div>
  );
}
