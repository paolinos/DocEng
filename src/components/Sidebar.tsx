import {
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  PanelLeftClose,
} from "lucide-react";
import type { AppActions } from "../hooks/useAppActions";
import { FileTree } from "./FileTree";
import { useProjectStore } from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";

interface SidebarProps {
  actions: AppActions;
}

export function Sidebar({ actions }: SidebarProps) {
  const project = useProjectStore((state) => state.project);
  const projectPath = useProjectStore((state) => state.projectPath);
  const projectFilePath = useProjectStore((state) => state.projectFilePath);
  const projectDirty = useProjectStore((state) => state.dirty);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);

  const roots = project.roots;

  return (
    <aside
      className="sidebar"
      aria-label="Project explorer"
      aria-hidden={sidebarCollapsed}
      inert={sidebarCollapsed}
    >
      <div className="sidebar__header">
        <span className="sidebar__eyebrow">Explorer</span>
        <button
          type="button"
          className="icon-button"
          title="Collapse sidebar (Ctrl+B)"
          aria-label="Collapse sidebar"
          onClick={actions.toggleSidebar}
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div
        className={
          roots.length > 0
            ? "sidebar__project"
            : "sidebar__project sidebar__project--empty"
        }
        title={projectFilePath ?? projectPath ?? project.name}
      >
        <FolderOpen size={14} className="sidebar__project-icon" />
        <span className="sidebar__project-name">{project.name}</span>
        {projectDirty ? (
          <span className="dirty-dot" title="Project has unsaved changes" />
        ) : null}
      </div>

      <div className="sidebar__body">
        {roots.length > 0 ? (
          <div className="tree">
            <div className="tree__section-label">Project files</div>
            <FileTree roots={roots} onOpenFile={actions.openFile} />
          </div>
        ) : (
          <div className="explorer-empty">
          </div>
        )}
      </div>

      <div className="sidebar__footer">
        <button type="button" className="sidebar-action" onClick={actions.addFolder}>
          <FolderPlus size={14} />
          <span>Add folder</span>
        </button>
        <button type="button" className="sidebar-action" onClick={actions.addFile}>
          <FilePlus2 size={14} />
          <span>Add file</span>
        </button>
        <button type="button" className="sidebar-action" onClick={actions.newFile}>
          <FileText size={14} />
          <span>New file</span>
        </button>
      </div>
    </aside>
  );
}
