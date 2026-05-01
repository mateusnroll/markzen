import { useFileSystemStore } from "../../store/fileSystemStore";
import { useTabsStore } from "../../store/tabsStore";
import { editorRef } from "../../lib/editorRef";
import { openFileFromTree } from "../../lib/fileOperations";
import type { FileTreeEntry } from "../../types/fileTree";

function isMarkdown(name: string): boolean {
  return /\.(md|markdown)$/i.test(name);
}

interface FileTreeNodeProps {
  entry: FileTreeEntry;
  depth: number;
}

export function FileTreeNode({ entry, depth }: FileTreeNodeProps) {
  const expandedDirs = useFileSystemStore((s) => s.expandedDirs);
  const dirChildren = useFileSystemStore((s) => s.dirChildren);
  const loadingDirs = useFileSystemStore((s) => s.loadingDirs);
  const toggleDir = useFileSystemStore((s) => s.toggleDir);

  const activeFilePath = useTabsStore((s) => {
    const active = s.tabs.find((t) => t.id === s.activeTabId);
    return active?.filePath ?? null;
  });

  const isExpanded = expandedDirs.has(entry.path);
  const children = dirChildren[entry.path];
  const isLoading = loadingDirs[entry.path];
  const isActive = entry.path === activeFilePath;

  const paddingLeft = 12 + depth * 16;

  if (entry.isDirectory) {
    return (
      <div>
        <button
          type="button"
          className="flex w-full items-center gap-1.5 py-0.5 text-left text-sm hover:bg-[var(--color-border)]"
          style={{ paddingLeft }}
          onClick={() => toggleDir(entry.path)}
        >
          <span className="w-4 shrink-0 text-[var(--color-text-muted)]">
            {isExpanded ? "▼" : "▶"}
          </span>
          <span className="truncate">{entry.name}</span>
        </button>
        {isExpanded && isLoading && (
          <div
            className="py-0.5 text-xs text-[var(--color-text-muted)]"
            style={{ paddingLeft: paddingLeft + 20 }}
          >
            Loading…
          </div>
        )}
        {isExpanded &&
          children?.map((child) => (
            <FileTreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  const md = isMarkdown(entry.name);

  return (
    <button
      type="button"
      className={
        "flex w-full items-center gap-1.5 py-0.5 text-left text-sm" +
        (md
          ? isActive
            ? " bg-[var(--color-border)] font-medium"
            : " hover:bg-[var(--color-border)]"
          : " cursor-default opacity-40")
      }
      style={{ paddingLeft: paddingLeft + 20 }}
      disabled={!md}
      onClick={() => {
        if (md && editorRef.current) {
          openFileFromTree(editorRef.current, entry.path);
        }
      }}
    >
      <span className="truncate">{entry.name}</span>
    </button>
  );
}
