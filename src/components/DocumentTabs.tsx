import type { KeyboardEvent, MouseEvent } from "react";
import {
  File,
  FileCode2,
  FileText,
  Image as ImageIcon,
  Network,
  Plus,
  Search,
  X,
} from "lucide-react";
import type { AppActions } from "../hooks/useAppActions";
import { useDocumentStore } from "../stores/documentStore";
import { useSearchStore } from "../stores/searchStore";
import { isDocumentDirty, type DocumentKind } from "../types";

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

interface DocumentTabsProps {
  actions: AppActions;
}

export function DocumentTabs({ actions }: DocumentTabsProps) {
  const documents = useDocumentStore((state) => state.documents);
  const activeId = useDocumentStore((state) => state.activeId);
  const searchOpen = useSearchStore((state) => state.projectSearchOpen);
  const searchActive = useSearchStore((state) => state.projectSearchActive);

  if (documents.length === 0 && !searchOpen) return null;

  async function closeTab(id: string) {
    const index = documents.findIndex((doc) => doc.id === id);
    await actions.closeFile(id);

    window.requestAnimationFrame(() => {
      const remaining = useDocumentStore.getState().documents;
      // The user cancelled the discard prompt, so the tab is still open.
      if (remaining.some((doc) => doc.id === id)) return;
      if (remaining.length === 0) return;

      const next = remaining[Math.min(index, remaining.length - 1)];
      document.getElementById(`editor-tab-${next.id}`)?.focus();
    });
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLDivElement>, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      actions.activateFile(id);
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    const offset = event.key === "ArrowRight" ? 1 : -1;
    const index = documents.findIndex((doc) => doc.id === id);
    const next = documents[(index + offset + documents.length) % documents.length];

    if (!next) return;

    actions.activateFile(next.id);
    document.getElementById(`editor-tab-${next.id}`)?.focus();
  }

  function onTabAuxClick(event: MouseEvent<HTMLDivElement>, id: string) {
    if (event.button !== 1) return;
    event.preventDefault();
    closeTab(id);
  }

  function onSearchTabKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      actions.activateProjectSearch();
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;

    event.preventDefault();
    if (documents.length === 0) return;

    const next =
      event.key === "ArrowRight"
        ? documents[0]
        : documents[documents.length - 1];
    actions.activateFile(next.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`editor-tab-${next.id}`)?.focus();
    });
  }

  return (
    <div className="editor__tabs">
      <div className="editor__tabs-list" role="tablist" aria-label="Open files">
        {documents.map((doc) => {
          const isActive = doc.id === activeId;
          const dirty = isDocumentDirty(doc);
          const Icon = iconForKind(doc.kind);

          return (
            <div
              id={`editor-tab-${doc.id}`}
              key={doc.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={
                isActive ? "editor-tab editor-tab--active" : "editor-tab"
              }
              title={doc.path ?? doc.name}
              onClick={() => actions.activateFile(doc.id)}
              onAuxClick={(event) => onTabAuxClick(event, doc.id)}
              onKeyDown={(event) => onTabKeyDown(event, doc.id)}
            >
              <Icon
                size={13}
                className={`editor-tab__icon editor-tab__icon--${iconClassForKind(doc.kind)}`}
              />
              <span className="editor-tab__label">{doc.name}</span>
              {doc.detached ? (
                <span
                  className="editor-tab__detached"
                  title="Detached from removed project root. Use Save As to save it to an authorized path."
                  aria-label="Detached document"
                >
                  detached
                </span>
              ) : null}
              {dirty ? (
                <span
                  className="editor-tab__dirty"
                  title="Unsaved changes"
                  aria-label="Unsaved changes"
                />
              ) : null}
              <button
                type="button"
                className="editor-tab__close"
                aria-label={`Close ${doc.name}`}
                title={`Close ${doc.name}`}
                onClick={(event) => {
                  event.stopPropagation();
                  closeTab(doc.id);
                }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}

        {searchOpen ? (
          <div
            id="editor-tab-search"
            role="tab"
            aria-selected={searchActive}
            tabIndex={searchActive ? 0 : -1}
            className={
              searchActive
                ? "editor-tab editor-tab--search editor-tab--active"
                : "editor-tab editor-tab--search"
            }
            title="Find in Project"
            onClick={actions.activateProjectSearch}
            onAuxClick={(event) => {
              if (event.button !== 1) return;
              event.preventDefault();
              actions.closeProjectSearch();
            }}
            onKeyDown={onSearchTabKeyDown}
          >
            <Search
              size={13}
              className="editor-tab__icon editor-tab__icon--search"
            />
            <span className="editor-tab__label">Search</span>
            <button
              type="button"
              className="editor-tab__close"
              aria-label="Close Search tab"
              title="Close Search tab"
              onClick={(event) => {
                event.stopPropagation();
                actions.closeProjectSearch();
              }}
            >
              <X size={12} />
            </button>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        className="editor-tab__new"
        title="New file"
        aria-label="New file"
        onClick={actions.newFile}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
