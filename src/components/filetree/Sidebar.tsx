import { FileTree } from "./FileTree";

const isMacOS = navigator.userAgent.includes("Mac");

export function Sidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col overflow-hidden border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      {isMacOS && (
        <div className="h-9 shrink-0" data-tauri-drag-region />
      )}
      <div className="flex-1 overflow-y-auto">
        <FileTree />
      </div>
    </aside>
  );
}
