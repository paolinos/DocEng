import { useEffect, useRef, useState } from "react";
import type { ComponentType, KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  Check,
  Columns2,
  Eye,
  FilePlus,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  Info,
  NotebookPen,
  PanelLeft,
  Pencil,
  RotateCcw,
  Save,
  X,
} from "lucide-react";
import { formatShortcut } from "../lib/platform";
import type { AppActions } from "../hooks/useAppActions";
import { useDocumentStore } from "../stores/documentStore";
import {
  selectCanSaveProject,
  useProjectStore,
} from "../stores/projectStore";
import { useUiStore } from "../stores/uiStore";

type MenuId = "project" | "file" | "view" | "help";
type IconComponent = ComponentType<{ size?: number | string; strokeWidth?: number }>;

interface MenuItem {
  id: string;
  label: string;
  icon?: IconComponent;
  shortcut?: string;
  disabled?: boolean;
  checked?: boolean;
  action: () => void;
}

interface MenuSeparator {
  id: string;
  type: "separator";
}

type MenuEntry = MenuItem | MenuSeparator;

interface MenuDefinition {
  label: string;
  items: MenuEntry[];
}

const MENU_ORDER: MenuId[] = ["project", "file", "view", "help"];

function isSeparator(entry: MenuEntry): entry is MenuSeparator {
  return "type" in entry && entry.type === "separator";
}

interface MenuBarProps {
  actions: AppActions;
}

export function MenuBar({ actions }: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<MenuId | null>(null);

  const barRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Partial<Record<MenuId, HTMLButtonElement | null>>>({});

  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const viewMode = useUiStore((state) => state.viewMode);
  const canSaveProject = useProjectStore(selectCanSaveProject);
  const projectName = useProjectStore((state) => state.project.name);
  const doc = useDocumentStore((state) => state.doc);
  const hasDocument = doc !== null;

  const menus: Record<MenuId, MenuDefinition> = {
    project: {
      label: "Project",
      items: [
        {
          id: "new-project",
          label: "New Project",
          icon: FilePlus2,
          shortcut: formatShortcut("N"),
          action: actions.newProject,
        },
        {
          id: "open-project",
          label: "Open Project…",
          icon: FolderOpen,
          shortcut: formatShortcut("O"),
          action: actions.openProject,
        },
        {
          id: "open-project-folder",
          label: "Open Folder as Project…",
          icon: FolderOpen,
          action: actions.openProjectFolder,
        },
        { id: "project-sep-1", type: "separator" },
        {
          id: "save-project",
          label: "Save Project",
          icon: Save,
          shortcut: formatShortcut("S", { shift: true }),
          disabled: !canSaveProject,
          action: actions.saveProject,
        },
        {
          id: "save-project-as",
          label: "Save Project As…",
          icon: Save,
          disabled: !canSaveProject,
          action: actions.saveProjectAs,
        },
        { id: "project-sep-2", type: "separator" },
        {
          id: "add-file",
          label: "Add File…",
          icon: FilePlus,
          action: actions.addFile,
        },
        {
          id: "add-folder",
          label: "Add Folder…",
          icon: FolderPlus,
          action: actions.addFolder,
        },
      ],
    },
    file: {
      label: "File",
      items: [
        {
          id: "new-file",
          label: "New File",
          icon: FilePlus2,
          shortcut: formatShortcut("N", { alt: true }),
          action: actions.newFile,
        },
        { id: "file-sep-1", type: "separator" },
        {
          id: "save-file",
          label: "Save File",
          icon: Save,
          shortcut: formatShortcut("S"),
          disabled: !hasDocument,
          action: actions.saveFile,
        },
        {
          id: "close-file",
          label: "Close File",
          icon: X,
          disabled: !hasDocument,
          action: actions.closeFile,
        },
      ],
    },
    view: {
      label: "View",
      items: [
        {
          id: "toggle-sidebar",
          label: "Toggle Sidebar",
          icon: PanelLeft,
          shortcut: formatShortcut("B"),
          checked: !sidebarCollapsed,
          action: actions.toggleSidebar,
        },
        { id: "view-sep-1", type: "separator" },
        {
          id: "view-edit",
          label: "Editor",
          icon: Pencil,
          shortcut: formatShortcut("1"),
          checked: viewMode === "edit",
          action: () => actions.setViewMode("edit"),
        },
        {
          id: "view-split",
          label: "Split",
          icon: Columns2,
          shortcut: formatShortcut("2"),
          checked: viewMode === "split",
          action: () => actions.setViewMode("split"),
        },
        {
          id: "view-preview",
          label: "Preview",
          icon: Eye,
          shortcut: formatShortcut("3"),
          checked: viewMode === "preview",
          action: () => actions.setViewMode("preview"),
        },
        { id: "view-sep-2", type: "separator" },
        {
          id: "reset-layout",
          label: "Reset Layout",
          icon: RotateCcw,
          action: actions.resetLayout,
        },
      ],
    },
    help: {
      label: "Help",
      items: [
        {
          id: "about",
          label: "About docu",
          icon: Info,
          action: actions.showAbout,
        },
      ],
    },
  };

  useEffect(() => {
    if (!openMenu) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!barRef.current?.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openMenu]);

  useEffect(() => {
    if (!openMenu) return;

    const frame = window.requestAnimationFrame(() => {
      const firstItem = popoverRef.current?.querySelector<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      );

      if (firstItem) {
        firstItem.focus();
      } else {
        popoverRef.current?.focus();
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [openMenu]);

  function handlePopoverKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
    menuId: MenuId,
  ) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpenMenu(null);
      buttonRefs.current[menuId]?.focus();
      return;
    }

    if (event.key === "Tab") {
      setOpenMenu(null);
      return;
    }

    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const offset = event.key === "ArrowRight" ? 1 : -1;
      const currentIndex = MENU_ORDER.indexOf(menuId);
      const nextIndex =
        (currentIndex + offset + MENU_ORDER.length) % MENU_ORDER.length;
      setOpenMenu(MENU_ORDER[nextIndex]);
      return;
    }

    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      event.preventDefault();
      const items = Array.from(
        popoverRef.current?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]:not(:disabled)',
        ) ?? [],
      );
      if (items.length === 0) return;

      const current = items.indexOf(document.activeElement as HTMLButtonElement);
      let next = 0;

      if (event.key === "ArrowDown") {
        next = current < 0 ? 0 : (current + 1) % items.length;
      } else if (event.key === "ArrowUp") {
        next = current <= 0 ? items.length - 1 : current - 1;
      } else if (event.key === "End") {
        next = items.length - 1;
      }

      items[next]?.focus();
    }
  }

  return (
    <div className="menubar" ref={barRef} role="menubar" aria-label="Application menu">
      <div className="menubar__brand">
        <span className="brand-mark">
          <NotebookPen size={14} strokeWidth={2} />
        </span>
        <span className="menubar__brand-name">docu</span>
      </div>

      <div className="menubar__menus">
        {MENU_ORDER.map((menuId) => {
          const menu = menus[menuId];
          const isOpen = openMenu === menuId;

          return (
            <div className="menu" key={menuId}>
              <button
                type="button"
                ref={(node) => {
                  buttonRefs.current[menuId] = node;
                }}
                className="menu__button"
                aria-haspopup="menu"
                aria-expanded={isOpen}
                onClick={() => setOpenMenu(isOpen ? null : menuId)}
                onPointerEnter={() => {
                  if (openMenu && !isOpen) setOpenMenu(menuId);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setOpenMenu(menuId);
                  }
                }}
              >
                {menu.label}
              </button>

              {isOpen ? (
                <div
                  className="menu-popover"
                  role="menu"
                  aria-label={menu.label}
                  ref={popoverRef}
                  tabIndex={-1}
                  onKeyDown={(event) => handlePopoverKeyDown(event, menuId)}
                >
                  {menu.items.map((entry) => {
                    if (isSeparator(entry)) {
                      return (
                        <div
                          className="menu-popover__separator"
                          role="separator"
                          key={entry.id}
                        />
                      );
                    }

                    const Icon = entry.icon;

                    return (
                      <button
                        type="button"
                        role="menuitem"
                        key={entry.id}
                        className="menu-popover__item"
                        disabled={entry.disabled}
                        onClick={() => {
                          if (entry.disabled) return;
                          setOpenMenu(null);
                          entry.action();
                        }}
                      >
                        <span className="menu-popover__icon">
                          {Icon ? <Icon size={14} strokeWidth={1.8} /> : null}
                        </span>
                        <span className="menu-popover__label">{entry.label}</span>
                        {entry.checked ? (
                          <Check className="menu-popover__check" size={13} />
                        ) : null}
                        {entry.shortcut ? (
                          <span className="menu-popover__shortcut">
                            {entry.shortcut}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="menubar__spacer" />

      <div
        className="menubar__context"
        title={doc ? (doc.path ?? doc.name) : projectName}
      >
        {doc?.name ?? projectName}
      </div>
    </div>
  );
}
