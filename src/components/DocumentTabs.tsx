import type { KeyboardEvent, MouseEvent } from "react";
import { File, FileText, Plus, X } from "lucide-react";
import type { AppActions } from "../hooks/useAppActions";
import { useDocumentStore } from "../stores/documentStore";
import { isDocumentDirty, isMarkdownFile } from "../types";

interface DocumentTabsProps {
  actions: AppActions;
}

export function DocumentTabs({ actions }: DocumentTabsProps) {
  const documents = useDocumentStore((state) => state.documents);
  const activeId = useDocumentStore((state) => state.activeId);

  if (documents.length === 0) return null;

  function closeTab(id: string) {
    const index = documents.findIndex((doc) => doc.id === id);
    actions.closeFile(id);

    window.requestAnimationFrame(() => {
      const remaining = useDocumentStore.getState().documents;
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

  return (
    <div className="editor__tabs">
      <div className="editor__tabs-list" role="tablist" aria-label="Open files">
        {documents.map((doc) => {
          const isActive = doc.id === activeId;
          const dirty = isDocumentDirty(doc);
          const Icon = isMarkdownFile(doc.path ?? doc.name) ? FileText : File;

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
                className={
                  isMarkdownFile(doc.path ?? doc.name)
                    ? "editor-tab__icon editor-tab__icon--markdown"
                    : "editor-tab__icon"
                }
              />
              <span className="editor-tab__label">{doc.name}</span>
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
