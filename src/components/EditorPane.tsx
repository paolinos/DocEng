import {
  Columns2,
  Eye,
  FileText,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  PanelLeftOpen,
  Pencil,
  Save,
} from "lucide-react";
import type { AppActions } from "../hooks/useAppActions";
import { C4Preview } from "./C4Preview";
import { DocumentTabs } from "./DocumentTabs";
import { ImagePreview } from "./ImagePreview";
import { MarkdownPreview } from "./MarkdownPreview";
import { SwaggerPreview } from "./SwaggerPreview";
import { isApiSpecFile } from "../lib/apiSpec";
import { formatShortcut } from "../lib/platform";
import {
  selectActiveDocument,
  useDocumentStore,
} from "../stores/documentStore";
import {
  selectHasWorkspace,
  useProjectStore,
} from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";
import { isDocumentDirty } from "../types";
import type { ViewMode } from "../types";

interface EditorPaneProps {
  actions: AppActions;
}

const VIEW_MODES: { mode: ViewMode; label: string; icon: typeof Pencil }[] = [
  { mode: "edit", label: "Edit", icon: Pencil },
  { mode: "split", label: "Split", icon: Columns2 },
  { mode: "preview", label: "Preview", icon: Eye },
];

export function EditorPane({ actions }: EditorPaneProps) {
  const doc = useDocumentStore(selectActiveDocument);
  const updateContent = useDocumentStore((state) => state.updateContent);
  const hasWorkspace = useProjectStore(selectHasWorkspace);
  const projectName = useProjectStore((state) => state.project.name);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const viewMode = useUiStore((state) => state.viewMode);
  const setViewMode = useUiStore((state) => state.setViewMode);

  const dirty = isDocumentDirty(doc);
  const isImage = doc?.kind === "image";
  const isApiSpec = doc ? isApiSpecFile(doc.name, doc.content) : false;

  return (
    <main className="editor" aria-label="Editor">
      <DocumentTabs actions={actions} />

      <header className="editor__header">
        {sidebarCollapsed ? (
          <button
            type="button"
            className="icon-button"
            title="Open sidebar (Ctrl+B)"
            aria-label="Open sidebar"
            onClick={actions.toggleSidebar}
          >
            <PanelLeftOpen size={16} />
          </button>
        ) : null}

        <div className="editor__title">
          <span className="editor__filename">
            {doc ? doc.name : hasWorkspace ? "No file open" : projectName}
            {doc?.detached ? (
              <span className="editor__detached-label">Detached</span>
            ) : null}
            {dirty ? <span className="dirty-dot dirty-dot--inline" /> : null}
          </span>
          {doc ? (
            <span className="editor__meta" title={doc.path ?? undefined}>
              {doc.detached
                ? "Removed from project — use Save As to save"
                : (doc.path ?? "Not saved yet")}
            </span>
          ) : (
            <span className="editor__meta">
              {hasWorkspace
                ? "Select a file from the explorer"
                : "Add a folder, add a file, or create a new document"}
            </span>
          )}
        </div>

        <div className="editor__header-spacer" />

        {!isImage ? (
          <div
            className="segmented"
            role="group"
            aria-label="Editor view mode"
          >
            {VIEW_MODES.map(({ mode, label, icon: Icon }) => (
              <button
                type="button"
                key={mode}
                className="segmented__button"
                aria-pressed={viewMode === mode}
                title={`${label} (${formatShortcut(
                  mode === "edit" ? "1" : mode === "split" ? "2" : "3",
                )})`}
                onClick={() => setViewMode(mode)}
              >
                <Icon size={13} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        ) : null}

        <button
          type="button"
          className="icon-button"
          title={
            isImage
              ? "Images are read-only"
              : `Save file (${formatShortcut("S")})`
          }
          aria-label="Save file"
          disabled={!doc || isImage}
          onClick={actions.saveFile}
        >
          <Save size={16} />
        </button>
      </header>

      <div className="editor__body">
        {doc ? (
          <div
            className={
              viewMode === "split" && doc.kind !== "image"
                ? "editor__document editor__document--split"
                : "editor__document"
            }
          >
            {doc.kind === "image" ? (
              <ImagePreview doc={doc} />
            ) : (
              <>
                {viewMode !== "preview" ? (
                  <textarea
                    key={doc.id}
                    className="editor__text"
                    aria-label={`Content of ${doc.name}`}
                    value={doc.content}
                    spellCheck={doc.kind === "markdown" || doc.kind === "text"}
                    autoFocus
                    onChange={(event) =>
                      updateContent(doc.id, event.target.value)
                    }
                  />
                ) : null}

                {viewMode !== "edit" ? (
                  <div className="editor__preview" aria-label="Preview">
                    {doc.kind === "markdown" ? (
                      <MarkdownPreview source={doc.content} />
                    ) : isApiSpec ? (
                      <SwaggerPreview source={doc.content} name={doc.name} />
                    ) : doc.kind === "likec4" ? (
                      <C4Preview
                        key={doc.id}
                        source={doc.content}
                        path={doc.path}
                        name={doc.name}
                      />
                    ) : (
                      <pre className="editor__plain-preview">
                        {doc.content}
                      </pre>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : (
          <div className="welcome">
            <div className="welcome__card">
              <div className="welcome__mark">
                <FileText size={28} strokeWidth={1.5} />
              </div>

              <h1>
                {hasWorkspace ? "Start writing." : "Start with a folder or a file."}
              </h1>
              <p>
                {hasWorkspace
                  ? "Add folders or individual files to the workspace, then pick a file from the explorer to edit it here."
                  : "A project file is optional. Add a folder, add an existing file, or create a new document to get started."}
              </p>

              <div className="welcome__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={actions.addFolder}
                >
                  <FolderPlus size={15} />
                  Add folder
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={actions.addFile}
                >
                  <FilePlus2 size={15} />
                  Add file
                </button>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={actions.newFile}
                >
                  <FileText size={15} />
                  New file
                </button>
              </div>

              {!hasWorkspace ? (
                <div className="welcome__actions welcome__actions--secondary">
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={actions.openProject}
                  >
                    <FolderOpen size={15} />
                    Open project
                  </button>
                  <button
                    type="button"
                    className="btn btn--secondary"
                    onClick={actions.newProject}
                  >
                    <FilePlus2 size={15} />
                    New project
                  </button>
                </div>
              ) : null}

              <div className="welcome__features" aria-hidden="true">
                <span className="feature-chip">
                  <FolderOpen size={12} />
                  Project-based
                </span>
                <span className="feature-chip">
                  <FileText size={12} />
                  Text &amp; Markdown
                </span>
                <span className="feature-chip">
                  <Eye size={12} />
                  Live preview
                </span>
              </div>

              <div className="welcome__shortcuts">
                <span>
                  <kbd>{formatShortcut("B")}</kbd> toggle sidebar
                </span>
                <span>
                  <kbd>{formatShortcut("N", { alt: true })}</kbd> new file
                </span>
                <span>
                  <kbd>{formatShortcut("N")}</kbd> new project
                </span>
                <span>
                  <kbd>{formatShortcut("S")}</kbd> save file
                </span>
                <span>
                  <kbd>{formatShortcut("W")}</kbd> close tab
                </span>
                <span>
                  <kbd>{formatShortcut("Tab")}</kbd> switch tabs
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
