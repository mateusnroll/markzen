import { useEffect } from "react";
import { RichEditor } from "../editor/RichEditor";
import { useFileStore } from "../../store/fileStore";
import { extractFilename, updateWindowTitle } from "../../lib/fileOperations";

export function AppShell() {
  const filePath = useFileStore((s) => s.filePath);
  const isDirty = useFileStore((s) => s.isDirty);

  const displayName = filePath ? extractFilename(filePath) : "Untitled";

  useEffect(() => {
    updateWindowTitle(filePath, isDirty);
  }, [filePath, isDirty]);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <header className="flex h-10 shrink-0 items-center border-b border-[var(--color-border)] px-4">
        <span className="text-sm font-medium text-[var(--color-text-muted)]">
          {displayName}{isDirty ? " — Edited" : ""}
        </span>
      </header>
      <main className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
        <RichEditor />
      </main>
    </div>
  );
}
