import { useMemo, useRef } from "react";
import { join } from "@tauri-apps/api/path";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import type {
  Project,
  ProjectRoot,
  ProjectRootType,
  ViewMode,
} from "../types";
import {
  documentKindForPath,
  documentLanguageForPath,
  isDocumentDirty,
} from "../types";
import { errorMessage, fileSystem, isAppError } from "../lib/fs";
import { parseProjectFile, serializeProject } from "../lib/projectFile";
import { basename } from "../lib/utils";
import {
  findDocumentByPath,
  selectActiveDocument,
  selectDirtyDocuments,
  useDocumentStore,
} from "../stores/documentStore";
import { useProjectStore } from "../stores/projectStore";
import { useToastStore } from "../stores/toastStore";
import { useUiStore } from "../stores/uiStore";

export interface AppActions {
  newProject: () => Promise<void>;
  openProject: () => Promise<void>;
  openProjectFolder: () => Promise<void>;
  saveProject: () => Promise<void>;
  saveProjectAs: () => Promise<void>;
  newFile: () => void;
  addFile: () => Promise<void>;
  addFolder: () => Promise<void>;
  removeRoot: (rootId: string) => Promise<void>;
  renamePath: (path: string, newName: string, isFolder: boolean) => Promise<void>;
  trashPath: (path: string, isFolder: boolean) => Promise<void>;
  openFile: (path: string) => Promise<void>;
  saveFile: () => Promise<void>;
  closeFile: (id?: string) => void;
  closeAllFiles: () => void;
  activateFile: (id: string) => void;
  cycleTab: (direction: 1 | -1) => void;
  toggleSidebar: () => void;
  setViewMode: (mode: ViewMode) => void;
  resetLayout: () => void;
  showAbout: () => void;
}

let untitledSequence = 1;

function nextUntitledName(): string {
  const existing = new Set(
    useDocumentStore.getState().documents.map((doc) => doc.name),
  );

  let name = "Untitle";
  while (existing.has(name)) {
    name = `Untitle-${untitledSequence++}`;
  }

  return name;
}

function createRootId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `root-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createRoot(path: string, type: ProjectRootType): ProjectRoot {
  return { id: createRootId(), path, type };
}

/**
 * Sends the full set of workspace roots to Rust. Rust canonicalizes them and
 * stores them as the only paths its filesystem commands may touch.
 */
async function authorizeRoots(roots: ProjectRoot[]): Promise<ProjectRoot[]> {
  const canonical = await fileSystem.setProjectRoots(
    roots.map((root) => root.path),
  );

  return roots.map((root, index) => ({
    ...root,
    path: canonical[index] ?? root.path,
  }));
}

function ensureProjectExtension(path: string): string {
  return /\.(ya?ml)$/i.test(path) ? path : `${path}.yaml`;
}

function projectNameFromPath(path: string): string {
  const name = basename(path)
    .replace(/\.(ya?ml)$/i, "")
    .trim();

  return name || "Untitled Project";
}

function isUntitledProjectName(name: string): boolean {
  return !name.trim() || name === "Untitled Project";
}

function defaultProjectFileName(name: string): string {
  const base = (name.trim() || "Untitled Project").replace(
    /[/\\:*?"<>|]/g,
    "-",
  );

  return `${base}.yaml`;
}

/**
 * Picks a sensible folder for the first save of an untitled document.
 */
async function defaultSavePath(fileName: string): Promise<string | undefined> {
  const state = useProjectStore.getState();
  const folderRoots = state.project.roots.filter(
    (root) => root.type === "folder",
  );
  const directory =
    folderRoots.find((root) => root.path === state.projectPath) ??
    folderRoots[0];

  if (!directory) return undefined;

  try {
    return await join(directory.path, fileName);
  } catch {
    return undefined;
  }
}

/**
 * Picks a sensible location for the first Save Project As.
 */
async function defaultProjectSavePath(
  projectName: string,
): Promise<string | undefined> {
  const state = useProjectStore.getState();

  if (state.projectFilePath) return state.projectFilePath;

  const folderRoots = state.project.roots.filter(
    (root) => root.type === "folder",
  );
  const directory =
    folderRoots.find((root) => root.path === state.projectPath) ??
    folderRoots[0];
  const fileName = defaultProjectFileName(projectName);

  if (!directory) return fileName;

  try {
    return await join(directory.path, fileName);
  } catch {
    return fileName;
  }
}

export function useAppActions(): AppActions {
  const push = useToastStore((state) => state.push);
  const workspaceEpoch = useRef(0);
  const openSequence = useRef(0);

  return useMemo<AppActions>(() => {
    function reportError(error: unknown): void {
      push(errorMessage(error), "error", 7000);
    }

    function confirmDiscard(message: string): boolean {
      const dirtyDocuments = selectDirtyDocuments(useDocumentStore.getState());
      const projectDirty = useProjectStore.getState().dirty;

      if (dirtyDocuments.length === 0 && !projectDirty) return true;
      return window.confirm(message);
    }

    async function actionsOpenFile(path: string): Promise<void> {
      const existing = findDocumentByPath(useDocumentStore.getState(), path);
      if (existing) {
        useDocumentStore.getState().activateDocument(existing.id);
        return;
      }

      const epoch = workspaceEpoch.current;
      const sequence = ++openSequence.current;

      try {
        const kindHint = documentKindForPath(path);

        if (kindHint === "image") {
          const image = await fileSystem.readImageFile(path);
          if (workspaceEpoch.current !== epoch) return;

          const state = useDocumentStore.getState();
          const alreadyOpen = findDocumentByPath(state, image.path);
          if (alreadyOpen) {
            state.activateDocument(alreadyOpen.id);
            return;
          }

          state.openDocument(
            {
              path: image.path,
              name: basename(image.path),
              kind: "image",
              language: null,
              image: {
                mimeType: image.mimeType,
                dataUrl: image.dataUrl,
              },
              content: "",
              savedContent: "",
              size: image.size,
              modifiedMs: image.modifiedMs,
            },
            sequence === openSequence.current,
          );
          return;
        }

        const file = await fileSystem.readTextFile(path);
        if (workspaceEpoch.current !== epoch) return;

        const state = useDocumentStore.getState();
        const alreadyOpen = findDocumentByPath(state, file.path);
        if (alreadyOpen) {
          state.activateDocument(alreadyOpen.id);
          return;
        }

        const kind = documentKindForPath(file.path);

        state.openDocument(
          {
            path: file.path,
            name: basename(file.path),
            kind,
            language: documentLanguageForPath(file.path, kind),
            image: null,
            content: file.content,
            savedContent: file.content,
            size: file.size,
            modifiedMs: file.modifiedMs,
          },
          sequence === openSequence.current,
        );
      } catch (error) {
        if (workspaceEpoch.current !== epoch) return;

        if (isAppError(error) && error.code === "binary_file") {
          push(
            "This file contains binary data and cannot be opened as text.",
            "error",
          );
          return;
        }

        reportError(error);
      }
    }

    /**
     * Replaces the contents of an existing tab with the current on-disk file.
     * Used after the user chooses to discard local edits on a save conflict.
     */
    async function reloadDocument(id: string, path: string): Promise<void> {
      try {
        const file = await fileSystem.readTextFile(path);
        const kind = documentKindForPath(file.path);

        useDocumentStore.getState().replaceDocument(id, {
          path: file.path,
          name: basename(file.path),
          kind,
          language: documentLanguageForPath(file.path, kind),
          image: null,
          content: file.content,
          savedContent: file.content,
          size: file.size,
          modifiedMs: file.modifiedMs,
        });
      } catch (error) {
        reportError(error);
      }
    }

    async function writeProjectFile(
      target: string,
      expectedModifiedMs: number | null,
      deriveName: boolean,
    ): Promise<{ path: string; name: string }> {
      const state = useProjectStore.getState();
      const name =
        deriveName && isUntitledProjectName(state.project.name)
          ? projectNameFromPath(target)
          : state.project.name;
      const yaml = serializeProject({ ...state.project, name });
      const authorization = await fileSystem.authorizeNewFile(target);
      const result = await fileSystem.writeTextFile(
        authorization.path,
        yaml,
        expectedModifiedMs,
      );

      useProjectStore.getState().markProjectSaved({
        path: result.path,
        modifiedMs: result.modifiedMs,
        name,
      });

      return { path: result.path, name };
    }

    async function saveProjectAsAction(): Promise<void> {
      const state = useProjectStore.getState();

      if (state.project.roots.length === 0) {
        push("Add a folder or file before saving the project.", "warning");
        return;
      }

      try {
        const selected = await saveDialog({
          title: "Save Project As",
          defaultPath: await defaultProjectSavePath(state.project.name),
          filters: [{ name: "Project files", extensions: ["yaml", "yml"] }],
        });

        if (selected === null) return;

        const saved = await writeProjectFile(
          ensureProjectExtension(selected),
          null,
          true,
        );

        push(`Saved project "${saved.name}".`, "success");
      } catch (error) {
        reportError(error);
      }
    }

    async function saveProjectAction(): Promise<void> {
      const state = useProjectStore.getState();

      if (state.project.roots.length === 0) {
        push("Add a folder or file before saving the project.", "warning");
        return;
      }

      if (!state.projectFilePath) {
        await saveProjectAsAction();
        return;
      }

      const target = state.projectFilePath;

      try {
        const saved = await writeProjectFile(
          target,
          state.projectFileModifiedMs,
          false,
        );
        push(`Saved project "${saved.name}".`, "success");
      } catch (error) {
        if (!isAppError(error) || error.code !== "conflict") {
          reportError(error);
          return;
        }

        const overwrite = window.confirm(
          "The project file changed on disk since it was opened. Overwrite it with the current project?",
        );
        if (!overwrite) return;

        try {
          const saved = await writeProjectFile(target, null, false);
          push(`Saved project "${saved.name}".`, "success");
        } catch (retryError) {
          reportError(retryError);
        }
      }
    }

    async function newProjectAction(): Promise<void> {
      if (
        !confirmDiscard(
          "The open files or project have unsaved changes. Discard them and create a new project?",
        )
      ) {
        return;
      }

      workspaceEpoch.current += 1;
      useDocumentStore.getState().closeAllDocuments();
      useProjectStore.getState().newProject();

      // A new workspace starts empty, so revoke access to the old project's
      // paths until the user adds a folder or file.
      try {
        await fileSystem.setProjectRoots([]);
      } catch (error) {
        reportError(error);
      }

      push("New project created.", "success");
    }

    async function openProjectAction(): Promise<void> {
      try {
        const selected = await openDialog({
          multiple: false,
          title: "Open project file",
          filters: [{ name: "Project files", extensions: ["yaml", "yml"] }],
        });

        if (selected === null) return;

        if (
          !confirmDiscard(
            "The open files or project have unsaved changes. Discard them and open another project?",
          )
        ) {
          return;
        }

        // The project file must be readable before its roots are authorized.
        // This grants access to the exact file, not to its whole folder.
        const authorization = await fileSystem.authorizeNewFile(selected);
        const file = await fileSystem.readTextFile(authorization.path);
        const data = parseProjectFile(file.content);
        const roots = data.roots.map((root) =>
          createRoot(root.path, root.type),
        );
        const canonicalRoots = await authorizeRoots(roots);
        const project: Project = {
          version: 1,
          name: data.name,
          roots: canonicalRoots,
        };

        workspaceEpoch.current += 1;
        useProjectStore.getState().replaceProject(project, null);
        useProjectStore.getState().setProjectFile(file.path, file.modifiedMs);
        useDocumentStore.getState().closeAllDocuments();
        push(`Project "${project.name}" opened.`, "success");
      } catch (error) {
        reportError(error);
      }
    }

    async function openProjectFolderAction(): Promise<void> {
      try {
        const selected = await openDialog({
          directory: true,
          multiple: false,
          recursive: true,
          title: "Open folder as project",
        });

        if (selected === null) return;

        if (
          !confirmDiscard(
            "The open files or project have unsaved changes. Discard them and open another project?",
          )
        ) {
          return;
        }

        const roots = await authorizeRoots([createRoot(selected, "folder")]);
        const name = basename(roots[0].path) || "Untitled Project";
        const project: Project = { version: 1, name, roots };

        workspaceEpoch.current += 1;
        useProjectStore.getState().replaceProject(project, roots[0].path);
        useProjectStore.getState().markDirty();
        useDocumentStore.getState().closeAllDocuments();
        push(`Opened folder "${name}" as a project.`, "success");
      } catch (error) {
        reportError(error);
      }
    }

    return {
      newProject: newProjectAction,
      openProject: openProjectAction,
      openProjectFolder: openProjectFolderAction,
      saveProject: saveProjectAction,
      saveProjectAs: saveProjectAsAction,

      newFile: () => {
        openSequence.current += 1;
        useDocumentStore.getState().openDocument({
          path: null,
          name: nextUntitledName(),
          kind: "markdown",
          language: null,
          image: null,
          content: "",
          savedContent: "",
          size: 0,
          modifiedMs: null,
        });
        push("New file created. Save it to keep your changes.", "info");
      },

      addFolder: async () => {
        try {
          const selected = await openDialog({
            directory: true,
            multiple: false,
            recursive: true,
            title: "Add folder to workspace",
          });

          if (selected === null) return;

          const currentRoots = useProjectStore.getState().project.roots;
          if (currentRoots.some((root) => root.path === selected)) {
            push("That folder is already part of the workspace.", "info");
            return;
          }

          const roots = await authorizeRoots([
            ...currentRoots,
            createRoot(selected, "folder"),
          ]);

          useProjectStore.getState().setRoots(roots);
          push(`Added folder "${basename(selected)}".`, "success");
        } catch (error) {
          reportError(error);
        }
      },

      addFile: async () => {
        try {
          const selected = await openDialog({
            multiple: false,
            title: "Add file to workspace",
          });

          if (selected === null) return;

          const currentRoots = useProjectStore.getState().project.roots;
          if (currentRoots.some((root) => root.path === selected)) {
            push("That file is already part of the workspace.", "info");
            return;
          }

          const nextRoot = createRoot(selected, "file");
          const roots = await authorizeRoots([...currentRoots, nextRoot]);

          useProjectStore.getState().setRoots(roots);
          push(`Added file "${basename(selected)}".`, "success");

          // Selecting a single file is an explicit request to edit it.
          await actionsOpenFile(roots[roots.length - 1].path);
        } catch (error) {
          reportError(error);
        }
      },

      renamePath: async (path: string, newName: string, isFolder: boolean) => {
        const oldName = basename(path);
        try {
          if (!newName.trim() || newName === "." || newName === ".." || /[\\/]/.test(newName)) {
            push("Enter a valid name without a path separator.", "warning");
            return;
          }
          const result = await fileSystem.renameEntry(path, newName);
          useDocumentStore
            .getState()
            .renameDocumentsUnderPath(path, isFolder, result);
          useProjectStore.getState().renameRootPath(path, result);
          useProjectStore.getState().bumpExplorerRevision();
          push(`Renamed "${oldName}" to "${basename(result)}".`, "success");
        } catch (error) {
          reportError(error);
        }
      },

      trashPath: async (path: string, isFolder: boolean) => {
        try {
          await fileSystem.trashEntry(path);
          useDocumentStore
            .getState()
            .detachDocumentsUnderPath(path, isFolder);
          useProjectStore.getState().removeRootsUnderPath(path);
          useProjectStore.getState().bumpExplorerRevision();
          push(`Moved "${basename(path)}" to Trash.`, "success");
        } catch (error) {
          reportError(error);
        }
      },

      removeRoot: async (rootId: string) => {
        const projectState = useProjectStore.getState();
        const root = projectState.project.roots.find((item) => item.id === rootId);
        if (!root) return;

        const remainingProjectRoots = projectState.project.roots.filter(
          (item) => item.id !== rootId,
        );
        try {
          const remainingRoots = remainingProjectRoots;
          // Update the OS-side allowlist only after all remaining paths have
          // been validated. A failed authorization leaves the project intact.
          const roots = await authorizeRoots(remainingRoots);

          // Detached documents have no authorized old path, so Save uses the
          // Save As flow and can explicitly authorize a new destination.
          // Preserve the open buffers, but detach them from the removed path so
          // they cannot accidentally write back to a root no longer authorized.
          useDocumentStore
            .getState()
            .detachDocumentsUnderRoot(
              root.path,
              root.type === "folder",
              roots.map((r) => ({ path: r.path, type: r.type })),
            );

          // Confirmed removal only changes the workspace roots and the native
          // filesystem allowlist. It does not delete anything from disk.
          useProjectStore.getState().setRoots(roots);
          push(
            `Removed "${basename(root.path)}" from the project. It remains on disk.`,
            "success",
          );
        } catch (error) {
          reportError(error);
        }
      },

      openFile: async (path: string) => {
        await actionsOpenFile(path);
      },

      saveFile: async () => {
        const active = selectActiveDocument(useDocumentStore.getState());
        if (!active) {
          push("No file is open.", "info");
          return;
        }

        if (active.kind === "image") {
          push("Images are read-only in this editor.", "info");
          return;
        }

        const {
          id,
          path: currentPath,
          content,
          modifiedMs,
          name,
          kind,
        } = active;

        try {
          if (currentPath === null) {
            const selected = await saveDialog({
              title: "Save File",
              defaultPath: await defaultSavePath(name),
            });

            if (selected === null) return;

            const target = selected;
            const authorization = await fileSystem.authorizeNewFile(target);

            const alreadyOpen = findDocumentByPath(
              useDocumentStore.getState(),
              authorization.path,
            );
            if (alreadyOpen && alreadyOpen.id !== id) {
              useDocumentStore.getState().activateDocument(alreadyOpen.id);
              push(
                `"${alreadyOpen.name}" is already open in another tab. Choose a different path or close that tab first.`,
                "warning",
                7000,
              );
              return;
            }

            const result = await fileSystem.writeTextFile(
              authorization.path,
              content,
              null,
            );

            const savedKind = documentKindForPath(result.path);

            useDocumentStore.getState().markSaved({
              id,
              path: result.path,
              name: basename(result.path),
              kind: savedKind,
              language: documentLanguageForPath(result.path, savedKind),
              image: null,
              content,
              size: result.size,
              modifiedMs: result.modifiedMs,
            });

            if (authorization.added) {
              const roots = useProjectStore.getState().project.roots;
              if (!roots.some((root) => root.path === authorization.path)) {
                useProjectStore
                  .getState()
                  .addRoot(createRoot(authorization.path, "file"));
              }
            }

            useProjectStore.getState().bumpExplorerRevision();
            push(`Saved "${basename(result.path)}".`, "success");
            return;
          }

          const result = await fileSystem.writeTextFile(
            currentPath,
            content,
            modifiedMs,
          );
          useDocumentStore.getState().markSaved({
            id,
            path: result.path,
            name,
            kind,
            language: active.language,
            image: active.image,
            content,
            size: result.size,
            modifiedMs: result.modifiedMs,
          });
          push(`Saved "${name}".`, "success");
        } catch (error) {
          if (
            currentPath !== null &&
            isAppError(error) &&
            error.code === "conflict"
          ) {
            const reload = window.confirm(
              `"${name}" changed on disk since it was opened. Reload the version on disk and discard your unsaved edits?`,
            );

            if (reload) {
              await reloadDocument(id, currentPath);
            }
            return;
          }

          reportError(error);
        }
      },

      closeFile: (id?: string) => {
        const state = useDocumentStore.getState();
        const target = id
          ? (state.documents.find((doc) => doc.id === id) ?? null)
          : selectActiveDocument(state);

        if (!target) return;

        if (
          isDocumentDirty(target) &&
          !window.confirm(`Discard unsaved changes to "${target.name}"?`)
        ) {
          return;
        }

        useDocumentStore.getState().closeDocument(target.id);
        push(`Closed "${target.name}".`, "info");
      },

      closeAllFiles: () => {
        const dirtyDocuments = selectDirtyDocuments(useDocumentStore.getState());
        if (dirtyDocuments.length === 0) {
          if (useDocumentStore.getState().documents.length === 0) return;
          useDocumentStore.getState().closeAllDocuments();
          push("All files closed.", "info");
          return;
        }

        const label =
          dirtyDocuments.length === 1
            ? `"${dirtyDocuments[0].name}"`
            : `${dirtyDocuments.length} files`;

        if (
          !window.confirm(
            `Discard unsaved changes to ${label} and close all files?`,
          )
        ) {
          return;
        }

        useDocumentStore.getState().closeAllDocuments();
        push("All files closed.", "info");
      },

      activateFile: (id) => useDocumentStore.getState().activateDocument(id),

      cycleTab: (direction) =>
        useDocumentStore.getState().cycleDocument(direction),

      toggleSidebar: () => useUiStore.getState().toggleSidebar(),

      setViewMode: (mode) => useUiStore.getState().setViewMode(mode),

      resetLayout: () => {
        useUiStore.getState().resetLayout();
        push("Layout reset.", "info");
      },

      showAbout: () => {
        push(
          "docu 0.1.0 — a project-based Markdown and text editor built with Tauri 2 + React.",
          "info",
          6500,
        );
      },
    };
  }, [push]);
}
