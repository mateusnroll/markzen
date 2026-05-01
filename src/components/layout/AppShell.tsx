import { RichEditor } from "../editor/RichEditor";

export function AppShell() {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden">
      <header className="flex h-10 shrink-0 items-center border-b border-[var(--color-border)] px-4">
        <span className="text-sm font-medium text-[var(--color-text-muted)]">
          Markzen
        </span>
      </header>
      <main className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
        <RichEditor />
      </main>
    </div>
  );
}
