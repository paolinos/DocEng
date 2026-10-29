import { Columns2, Eye, FileText, FolderTree, Pencil } from "lucide-react";
import { formatBytes } from "../lib/utils";
import {
  selectActiveDocument,
  useDocumentStore,
} from "../stores/documentStore";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";
import { isDocumentDirty } from "../types";

const VIEW_LABELS = {
  edit: "Edit",
  split: "Split",
  preview: "Preview",
} as const;

const VIEW_ICONS = {
  edit: Pencil,
  split: Columns2,
  preview: Eye,
} as const;

export function StatusBar() {
  const doc = useDocumentStore(selectActiveDocument);
  const tabCount = useDocumentStore((state) => state.documents.length);
  const project = useProjectStore((state) => state.project);
  const projectPath = useProjectStore((state) => state.projectPath);
  const projectFilePath = useProjectStore((state) => state.projectFilePath);
  const projectDirty = useProjectStore((state) => state.dirty);
  const viewMode = useUiStore((state) => state.viewMode);

  const ViewIcon = VIEW_ICONS[viewMode];
  const docDirty = isDocumentDirty(doc);

  return (
    <footer className="statusbar" aria-label="Status bar">
      <div
        className="statusbar__group"
        title={projectFilePath ?? projectPath ?? undefined}
      >
        <FolderTree size={12} />
        <span className="statusbar__project">{project.name}</span>
        {projectDirty ? (
          <span className="statusbar__dot" title="Unsaved project changes" />
        ) : null}
      </div>

      <div className="statusbar__divider" />

      <div className="statusbar__group statusbar__group--path">
        <FileText size={12} />
        <span
          className="statusbar__path"
          title={doc?.path ?? projectFilePath ?? projectPath ?? undefined}
        >
          {doc
            ? (doc.path ?? "Not saved yet")
            : (projectFilePath ?? projectPath ?? "No file open")}
        </span>
        {docDirty ? (
          <span className="statusbar__unsaved">unsaved</span>
        ) : null}
      </div>

      <div className="statusbar__spacer" />

      {doc ? (
        <span className="statusbar__badge" title="File size">
          {formatBytes(doc.size)}
        </span>
      ) : null}

      {doc ? <span className="statusbar__badge">UTF-8</span> : null}

      {tabCount > 1 ? (
        <span className="statusbar__badge" title="Open tabs">
          {tabCount} tabs
        </span>
      ) : null}

      <span className="statusbar__badge statusbar__badge--view">
        <ViewIcon size={11} />
        {VIEW_LABELS[viewMode]}
      </span>

      <span className="statusbar__version">docu 0.1.0</span>
    </footer>
  );
}
