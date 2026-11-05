import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
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
import { FindBar } from "./FindBar";
import { ImagePreview } from "./ImagePreview";
import { MarkdownPreview } from "./MarkdownPreview";
import { SwaggerPreview } from "./SwaggerPreview";
import { isApiSpecFile } from "../lib/apiSpec";
import { formatShortcut } from "../lib/platform";
import { findMatches, buildSearchSegments } from "../lib/search";
import {
  selectActiveDocument,
  useDocumentStore,
} from "../stores/documentStore";
import {
  selectHasWorkspace,
  useProjectStore,
} from "../stores/projectStore";
import { useSearchStore } from "../stores/searchStore";
import { useUiStore } from "../stores/uiStore";
import { isDocumentDirty } from "../types";
import type { ViewMode } from "../types";

function scrollTextareaToOffset(
  textarea: HTMLTextAreaElement,
  offset: number,
): void {
  const lineHeight = Number.parseFloat(
    window.getComputedStyle(textarea).lineHeight,
  );
  if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;

  const lineIndex = textarea.value.slice(0, offset).split("\n").length - 1;
  const target =
    lineIndex * lineHeight - textarea.clientHeight / 2 + lineHeight / 2;
  const maxScroll = Math.max(
    0,
    textarea.scrollHeight - textarea.clientHeight,
  );

  textarea.scrollTop = Math.min(Math.max(0, target), maxScroll);
}

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
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  const findOpen = useSearchStore((state) => state.findOpen);
  const findQuery = useSearchStore((state) => state.query);
  const findCaseSensitive = useSearchStore((state) => state.caseSensitive);
  const findActiveIndex = useSearchStore((state) => state.activeIndex);
  const findRevealRequest = useSearchStore((state) => state.revealRequest);
  const setFindActiveIndex = useSearchStore((state) => state.setActiveIndex);
  const closeFind = useSearchStore((state) => state.closeFind);
  const resetFindForDocument = useSearchStore(
    (state) => state.resetForDocument,
  );
  const previousDocumentId = useRef<string | null>(null);

  const matches = useMemo(
    () =>
      findOpen && doc !== null && doc.kind !== "image"
        ? findMatches(doc.content, findQuery, findCaseSensitive)
        : [],
    [findOpen, doc, findQuery, findCaseSensitive],
  );

  const activeMatch =
    matches.length === 0
      ? null
      : (matches[Math.min(findActiveIndex, matches.length - 1)] ?? null);

  const activeMatchIndex =
    matches.length === 0
      ? -1
      : Math.min(findActiveIndex, matches.length - 1);

  const highlightSegments = useMemo(
    () =>
      findOpen && viewMode !== "preview" && matches.length > 0
        ? buildSearchSegments(doc?.content ?? "", matches)
        : [],
    [findOpen, viewMode, matches, doc?.content],
  );

  const syncHighlightLayer = useCallback(() => {
    const textarea = editorRef.current;
    const layer = highlightRef.current;
    if (!textarea || !layer) return;

    layer.style.width = `${textarea.clientWidth}px`;
    layer.style.height = `${textarea.clientHeight}px`;
    layer.scrollTop = textarea.scrollTop;
    layer.scrollLeft = textarea.scrollLeft;
  }, []);

  useLayoutEffect(() => {
    syncHighlightLayer();
  });

  useEffect(() => {
    const textarea = editorRef.current;
    if (!textarea) return;

    const observer = new ResizeObserver(syncHighlightLayer);
    observer.observe(textarea);
    return () => observer.disconnect();
  }, [syncHighlightLayer, viewMode, doc?.id]);

  useEffect(() => {
    const id = doc?.id ?? null;
    if (previousDocumentId.current === null) {
      previousDocumentId.current = id;
      return;
    }
    if (previousDocumentId.current === id) return;

    previousDocumentId.current = id;
    resetFindForDocument();
  }, [doc?.id, resetFindForDocument]);

  useEffect(() => {
    if (!findOpen) return;
    if (doc === null || doc.kind === "image") {
      closeFind();
      return;
    }
    if (matches.length === 0) {
      if (findActiveIndex !== 0) setFindActiveIndex(0);
      return;
    }
    if (findActiveIndex >= matches.length) {
      setFindActiveIndex(0);
    }
  }, [
    findOpen,
    doc,
    closeFind,
    matches.length,
    findActiveIndex,
    setFindActiveIndex,
  ]);

  useEffect(() => {
    if (!findOpen || activeMatch === null || viewMode === "preview") return;

    const textarea = editorRef.current;
    if (!textarea) return;

    textarea.setSelectionRange(activeMatch.start, activeMatch.end);
    scrollTextareaToOffset(textarea, activeMatch.start);
    syncHighlightLayer();
  }, [
    findOpen,
    findRevealRequest,
    viewMode,
    doc?.id,
    syncHighlightLayer,
  ]);

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

      {findOpen && doc && doc.kind !== "image" ? (
        <FindBar
          matchCount={matches.length}
          activeIndex={findActiveIndex}
          onNext={actions.findNext}
          onPrevious={actions.findPrevious}
          onClose={() => {
            actions.closeFind();
            window.requestAnimationFrame(() => editorRef.current?.focus());
          }}
        />
      ) : null}

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
                  <div className="editor__text-wrap">
                    {highlightSegments.length > 0 ? (
                      <div
                        ref={highlightRef}
                        className="editor__highlight-layer"
                        aria-hidden="true"
                      >
                        {highlightSegments.map((segment, index) =>
                          segment.matchIndex === null ? (
                            <span key={index}>{segment.text}</span>
                          ) : (
                            <mark
                              key={index}
                              className={
                                segment.matchIndex === activeMatchIndex
                                  ? "editor__highlight editor__highlight--active"
                                  : "editor__highlight"
                              }
                            >
                              {segment.text}
                            </mark>
                          ),
                        )}
                      </div>
                    ) : null}

                    <textarea
                      key={doc.id}
                      ref={editorRef}
                      className="editor__text"
                      aria-label={`Content of ${doc.name}`}
                      value={doc.content}
                      spellCheck={doc.kind === "markdown" || doc.kind === "text"}
                      autoFocus
                      onChange={(event) =>
                        updateContent(doc.id, event.target.value)
                      }
                      onScroll={syncHighlightLayer}
                    />
                  </div>
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
