import { useEffect, useState } from "react";
import {
  ChevronRight,
  File,
  FileText,
  Folder,
  FolderOpen,
} from "lucide-react";
import type { PathInfo } from "../lib/fs";
import { errorMessage, fileSystem } from "../lib/fs";
import { basename } from "../lib/utils";
import { useDocumentStore, selectActivePath } from "../stores/documentStore";
import { useProjectStore } from "../stores/projectStore";
import { useToastStore } from "../stores/toastStore";
import type { ProjectRoot } from "../types";
import { isMarkdownFile } from "../types";

interface TreeEntry {
  path: string;
  name: string;
  isDir: boolean;
}

interface FileTreeProps {
  roots: ProjectRoot[];
  onOpenFile: (path: string) => void;
}

interface TreeNodeProps {
  entry: TreeEntry;
  depth: number;
  revision: number;
  defaultExpanded?: boolean;
  onOpenFile: (path: string) => void;
}

function TreeNode({
  entry,
  depth,
  revision,
  defaultExpanded = false,
  onOpenFile,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [entries, setEntries] = useState<PathInfo[] | null>(null);
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const push = useToastStore((state) => state.push);
  const activePath = useDocumentStore(selectActivePath);

  useEffect(() => {
    if (!entry.isDir || !expanded) return;
    if (loadedRevision === revision) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fileSystem
      .listDirectory(entry.path)
      .then((listing) => {
        if (cancelled) return;
        setEntries(listing);
        setLoadedRevision(revision);
      })
      .catch((cause) => {
        if (cancelled) return;
        setError(errorMessage(cause));
        setLoadedRevision(revision);
        push(
          `Could not open folder "${entry.name}": ${errorMessage(cause)}`,
          "error",
          7000,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    entry.isDir,
    entry.path,
    entry.name,
    expanded,
    revision,
    loadedRevision,
    push,
  ]);

  const isActive = !entry.isDir && activePath === entry.path;

  const Icon = entry.isDir
    ? expanded
      ? FolderOpen
      : Folder
    : isMarkdownFile(entry.path)
      ? FileText
      : File;

  function activate() {
    if (entry.isDir) {
      setExpanded((value) => !value);
    } else {
      onOpenFile(entry.path);
    }
  }

  return (
    <li
      className="tree__node"
      role="treeitem"
      aria-expanded={entry.isDir ? expanded : undefined}
      aria-selected={isActive}
    >
      <button
        type="button"
        className={
          isActive ? "tree__row tree__row--active" : "tree__row"
        }
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        title={entry.path}
        onClick={activate}
      >
        <span className="tree__chevron" aria-hidden="true">
          {entry.isDir ? (
            <ChevronRight
              size={12}
              className={expanded ? "tree__chevron-icon--open" : undefined}
            />
          ) : null}
        </span>
        <Icon
          size={14}
          className={
            entry.isDir
              ? "tree__icon tree__icon--folder"
              : isMarkdownFile(entry.path)
                ? "tree__icon tree__icon--markdown"
                : "tree__icon tree__icon--file"
          }
        />
        <span className="tree__label">{entry.name}</span>
      </button>

      {entry.isDir && expanded ? (
        <ul className="tree__list" role="group">
          {loading ? (
            <li className="tree__note" style={{ paddingLeft: `${26 + depth * 14}px` }}>
              Loading…
            </li>
          ) : null}

          {!loading && error ? (
            <li
              className="tree__note tree__note--error"
              style={{ paddingLeft: `${26 + depth * 14}px` }}
              title={error}
            >
              Could not read folder
            </li>
          ) : null}

          {!loading && !error && entries?.length === 0 ? (
            <li
              className="tree__note"
              style={{ paddingLeft: `${26 + depth * 14}px` }}
            >
              Empty folder
            </li>
          ) : null}

          {entries?.map((child) => (
            <TreeNode
              key={child.path}
              entry={child}
              depth={depth + 1}
              revision={revision}
              onOpenFile={onOpenFile}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FileTree({ roots, onOpenFile }: FileTreeProps) {
  const revision = useProjectStore((state) => state.explorerRevision);

  return (
    <ul className="tree__list" role="tree" aria-label="Project files">
      {roots.map((root) => (
        <TreeNode
          key={root.id}
          entry={{
            path: root.path,
            name: basename(root.path),
            isDir: root.type === "folder",
          }}
          depth={0}
          revision={revision}
          defaultExpanded={root.type === "folder"}
          onOpenFile={onOpenFile}
        />
      ))}
    </ul>
  );
}
