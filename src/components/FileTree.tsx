import { useEffect, useState } from "react";
import type { MouseEvent } from "react";
import {
  ChevronRight,
  File,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Network,
  X,
} from "lucide-react";
import type { PathInfo } from "../lib/fs";
import { errorMessage, fileSystem } from "../lib/fs";
import { basename } from "../lib/utils";
import { useDocumentStore, selectActivePath } from "../stores/documentStore";
import { useProjectStore } from "../stores/projectStore";
import { useToastStore } from "../stores/toastStore";
import type { DocumentKind, OpenDocument, ProjectRoot } from "../types";
import { documentKindForPath, isDocumentDirty } from "../types";

function iconForKind(kind: DocumentKind) {
  switch (kind) {
    case "markdown":
      return FileText;
    case "code":
      return FileCode2;
    case "image":
      return ImageIcon;
    case "likec4":
      return Network;
    default:
      return File;
  }
}

function iconClassForKind(kind: DocumentKind): string {
  switch (kind) {
    case "markdown":
      return "markdown";
    case "code":
      return "code";
    case "image":
      return "image";
    case "likec4":
      return "likec4";
    default:
      return "file";
  }
}

interface TreeEntry {
  path: string;
  name: string;
  isDir: boolean;
}

interface FileTreeProps {
  roots: ProjectRoot[];
  onOpenFile: (path: string) => void;
  onRemoveRoot: (rootId: string) => void;
  onRenamePath: (path: string, newName: string, isFolder: boolean) => Promise<void>;
  onTrashPath: (path: string, isFolder: boolean) => Promise<void>;
}

interface RemoveConfirmation {
  root: ProjectRoot;
  dirtyDocuments: OpenDocument[];
  detachedCount: number;
}

interface TreeNodeProps {
  entry: TreeEntry;
  depth: number;
  revision: number;
  defaultExpanded?: boolean;
  rootId?: string;
  onOpenFile: (path: string) => void;
  onRequestRemove?: (root: ProjectRoot) => void;
  onContextMenu: (event: MouseEvent<HTMLButtonElement>, entry: TreeEntry, root?: ProjectRoot) => void;
}

function TreeNode({
  entry,
  depth,
  revision,
  defaultExpanded = false,
  rootId,
  onOpenFile,
  onRequestRemove,
  onContextMenu,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [entries, setEntries] = useState<PathInfo[] | null>(null);
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const push = useToastStore((state) => state.push);
  const activePath = useDocumentStore(selectActivePath);
  const root = useProjectStore((state) =>
    rootId ? state.project.roots.find((item) => item.id === rootId) : undefined,
  );

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

  const kind = entry.isDir ? null : documentKindForPath(entry.path);
  const Icon = entry.isDir
    ? expanded
      ? FolderOpen
      : Folder
    : iconForKind(kind ?? "unsupported");

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
      <div className="tree__row-container">
        <button
          type="button"
          className={
            isActive ? "tree__row tree__row--active" : "tree__row"
          }
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          title={entry.path}
          onClick={activate}
          onContextMenu={(event) => onContextMenu(event, entry, root)}
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
                : `tree__icon tree__icon--${iconClassForKind(kind ?? "unsupported")}`
            }
          />
          <span className="tree__label">{entry.name}</span>
        </button>
        {rootId ? (
          <button
            type="button"
            className="tree__remove"
            title={`Remove ${entry.name} ${root?.type === "folder" ? "folder" : "file"} from project (keeps it on disk)`}
            aria-label={`Remove ${entry.name} ${root?.type === "folder" ? "folder" : "file"} from project`}
            onClick={() => root && onRequestRemove?.(root)}
          >
            <X size={13} />
          </button>
        ) : null}
      </div>

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
              onRequestRemove={onRequestRemove}
              onContextMenu={onContextMenu}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function FileTree({
  roots,
  onOpenFile,
  onRemoveRoot,
  onRenamePath,
  onTrashPath,
}: FileTreeProps) {
  const revision = useProjectStore((state) => state.explorerRevision);
  const [confirmation, setConfirmation] = useState<RemoveConfirmation | null>(null);
  const [menu, setMenu] = useState<{ entry: TreeEntry; root?: ProjectRoot; x: number; y: number } | null>(null);
  const [renameTarget, setRenameTarget] = useState<TreeEntry | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<TreeEntry | null>(null);
  const documents = useDocumentStore((state) => state.documents);

  const isWithinRoot = (path: string, rootPath: string) =>
    path.startsWith(`${rootPath}/`) || path.startsWith(`${rootPath}\\`);

  function requestRemove(root: ProjectRoot) {
    const affected = documents.filter(
      (document) =>
        document.path !== null &&
        (document.path === root.path ||
          (root.type === "folder" && isWithinRoot(document.path, root.path))),
    );
    const remainingRoots = roots.filter((item) => item.id !== root.id);
    const detachedCount = affected.filter((document) => {
      const path = document.path;
      return (
        path !== null &&
        !remainingRoots.some(
          (remainingRoot) =>
            path === remainingRoot.path ||
            (remainingRoot.type === "folder" &&
              isWithinRoot(path, remainingRoot.path)),
        )
      );
    }).length;

    setConfirmation({
      root,
      dirtyDocuments: affected.filter(isDocumentDirty),
      detachedCount,
    });
  }

  function confirmRemove() {
    if (!confirmation) return;
    const rootId = confirmation.root.id;
    setConfirmation(null);
    onRemoveRoot(rootId);
  }

  function openContextMenu(
    event: MouseEvent<HTMLButtonElement>,
    entry: TreeEntry,
    root?: ProjectRoot,
  ) {
    event.preventDefault();
    setMenu({ entry, root, x: event.clientX, y: event.clientY });
  }

  async function confirmRename() {
    if (!renameTarget) return;
    const entry = renameTarget;
    setRenameTarget(null);
    await onRenamePath(entry.path, renameValue, entry.isDir);
  }

  async function confirmTrash() {
    if (!deleteTarget) return;
    const entry = deleteTarget;
    setDeleteTarget(null);
    await onTrashPath(entry.path, entry.isDir);
  }

  return (
    <>
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
          rootId={root.id}
          onOpenFile={onOpenFile}
          onRequestRemove={requestRemove}
          onContextMenu={openContextMenu}
        />
        ))}
      </ul>
      {menu ? (
        <>
          <button
            type="button"
            className="tree-menu-dismiss"
            aria-label="Close file actions"
            onClick={() => setMenu(null)}
          />
          <div
            className="tree-context-menu"
            style={{ left: menu.x, top: menu.y }}
            role="menu"
            aria-label={`Actions for ${menu.entry.name}`}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setRenameValue(menu.entry.name);
                setRenameTarget(menu.entry);
                setMenu(null);
              }}
            >
              Rename
            </button>
            <button
              type="button"
              role="menuitem"
              className="tree-context-menu__danger"
              onClick={() => {
                setDeleteTarget(menu.entry);
                setMenu(null);
              }}
            >
              Move to Trash…
            </button>
            {menu.root ? (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  requestRemove(menu.root!);
                  setMenu(null);
                }}
              >
                Remove from project…
              </button>
            ) : null}
          </div>
        </>
      ) : null}
      {renameTarget ? (
        <div className="confirm-backdrop">
          <section className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="rename-title">
            <h2 id="rename-title">Rename item</h2>
            <label className="tree-rename-label">
              Name
              <input
                autoFocus
                value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void confirmRename();
                  if (event.key === "Escape") setRenameTarget(null);
                }}
              />
            </label>
            <div className="confirm-dialog__actions">
              <button type="button" onClick={() => setRenameTarget(null)}>Cancel</button>
              <button type="button" onClick={() => void confirmRename()}>Rename</button>
            </div>
          </section>
        </div>
      ) : null}
      {deleteTarget ? (
        <div className="confirm-backdrop">
          <section className="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="trash-title">
            <h2 id="trash-title">Move to Trash?</h2>
            <p>
              Move <strong>{deleteTarget.name}</strong>{deleteTarget.isDir ? " and its contents" : ""} to the system Trash?
              {documents.some((document) => document.path === deleteTarget.path || (deleteTarget.isDir && document.path !== null && isWithinRoot(document.path, deleteTarget.path)))
                ? " Open tabs will remain open as detached buffers."
                : ""}
            </p>
            <div className="confirm-dialog__actions">
              <button type="button" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button type="button" className="confirm-dialog__remove" onClick={() => void confirmTrash()}>Move to Trash</button>
            </div>
          </section>
        </div>
      ) : null}
      {confirmation ? (
        <div className="confirm-backdrop">
          <section
            className="confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="remove-root-title"
            aria-describedby="remove-root-description"
          >
            <h2 id="remove-root-title">Remove from project?</h2>
            <p id="remove-root-description">
              Remove <strong>{basename(confirmation.root.path)}</strong> from this
              project? It will remain on disk.
            </p>
            {confirmation.dirtyDocuments.length > 0 ? (
              <p>
                {confirmation.dirtyDocuments.length === 1
                  ? `“${confirmation.dirtyDocuments[0].name}” has unsaved changes.`
                  : `${confirmation.dirtyDocuments.length} open files have unsaved changes.`}
                These tabs will stay open.
              </p>
            ) : null}
            {confirmation.detachedCount > 0 ? (
              <p>
                {confirmation.detachedCount} open tab
                {confirmation.detachedCount === 1 ? " will" : "s will"} stay
                open but become detached. Use Save As to save them elsewhere.
              </p>
            ) : (
              <p>Open tabs covered by other project roots will remain attached.</p>
            )}
            <div className="confirm-dialog__actions">
              <button type="button" onClick={() => setConfirmation(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="confirm-dialog__remove"
                onClick={confirmRemove}
              >
                Remove from project
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
