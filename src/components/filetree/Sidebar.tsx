import { FileTree } from "./FileTree";

export function Sidebar() {
  return (
    <aside className="w-60 shrink-0 overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <FileTree />
    </aside>
  );
}
