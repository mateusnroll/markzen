import { useFileSystemStore } from "../../store/fileSystemStore";
import { FileTreeNode } from "./FileTreeNode";

function extractFolderName(path: string): string {
  return path.split("/").pop()?.split("\\").pop() ?? path;
}

export function FileTree() {
  const folderPath = useFileSystemStore((s) => s.folderPath);
  const children = useFileSystemStore((s) =>
    s.folderPath ? s.dirChildren[s.folderPath] : undefined,
  );

  if (!folderPath) return null;

  return (
    <div className="py-2">
      <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
        {extractFolderName(folderPath)}
      </div>
      {children?.map((entry) => (
        <FileTreeNode key={entry.path} entry={entry} depth={0} />
      ))}
    </div>
  );
}
