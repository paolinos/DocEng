import { useMemo, useRef } from "react";
import { join } from "@tauri-apps/api/path";
import {
  open as openDialog,
  save as saveDialog,
} from "@tauri-apps/plugin-dialog";
import type {
  DocumentKind,
  Project,
  ProjectRoot,
  ProjectRootType,
  ViewMode,
} from "../types";
import { isDocumentDirty, isMarkdownFile, isTextFile } from "../types";
import { errorMessage, fileSystem, isAppError } from "../lib/fs";
import { parseProjectFile, serializeProject } from "../lib/projectFile";
import { basename } from "../lib/utils";
import { useDocumentStore } from "../stores/documentStore";
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
  openFile: (path: string) => Promise<void>;
  saveFile: () => Promise<void>;
  closeFile: () => void;
  toggleSidebar: () => void;
  setViewMode: (mode: ViewMode) => void;
  resetLayout: () => void;
  showAbout: () => void;
}

let untitledSequence = 1;

function nextUntitledName(): string {
  return `Untitled-${untitledSequence++}.md`;
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

function documentKind(path: string): DocumentKind {
  if (isMarkdownFile(path)) return "markdown";
  if (isTextFile(path)) return "text";
  return "unsupported";
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

function hasFileExtension(path: string): boolean {
  const name = basename(path);
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1;
}

function ensureFileExtension(path: string, kind: DocumentKind): string {
  if (hasFileExtension(path)) return path;
  return `${path}.${kind === "markdown" ? "md" : "txt"}`;
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
  const openRequest = useRef(0);

  return useMemo<AppActions>(() => {
    function reportError(error: unknown): void {
      push(errorMessage(error), "error", 7000);
    }

    function confirmDiscard(message: string): boolean {
      const doc = useDocumentStore.getState().doc;
      const docDirty = doc !== null && isDocumentDirty(doc);
      const projectDirty = useProjectStore.getState().dirty;

      if (!docDirty && !projectDirty) return true;
      return window.confirm(message);
    }

    async function actionsOpenFile(
      path: string,
      force = false,
    ): Promise<void> {
      const state = useDocumentStore.getState();
      if (!force && state.doc?.path === path) return;

      if (
        !force &&
        state.doc &&
        isDocumentDirty(state.doc) &&
        !window.confirm(`Discard unsaved changes to "${state.doc.name}"?`)
      ) {
        return;
      }

      const requestId = ++openRequest.current;

      try {
        const file = await fileSystem.readTextFile(path);
        if (openRequest.current !== requestId) return;

        useDocumentStore.getState().open({
          path: file.path,
          name: basename(file.path),
          kind: documentKind(file.path),
          content: file.content,
          savedContent: file.content,
          size: file.size,
          modifiedMs: file.modifiedMs,
        });
      } catch (error) {
        if (openRequest.current !== requestId) return;

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
          "This document or project has unsaved changes. Discard them and create a new project?",
        )
      ) {
        return;
      }

      openRequest.current += 1;
      useDocumentStore.getState().close();
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
            "This document or project has unsaved changes. Discard them and open another project?",
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

        openRequest.current += 1;
        useProjectStore.getState().replaceProject(project, null);
        useProjectStore.getState().setProjectFile(file.path, file.modifiedMs);
        useDocumentStore.getState().close();
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
            "This document or project has unsaved changes. Discard them and open another project?",
          )
        ) {
          return;
        }

        const roots = await authorizeRoots([createRoot(selected, "folder")]);
        const name = basename(roots[0].path) || "Untitled Project";
        const project: Project = { version: 1, name, roots };

        openRequest.current += 1;
        useProjectStore.getState().replaceProject(project, roots[0].path);
        useProjectStore.getState().markDirty();
        useDocumentStore.getState().close();
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
        const doc = useDocumentStore.getState().doc;
        if (
          doc &&
          isDocumentDirty(doc) &&
          !window.confirm(
            `Discard unsaved changes to "${doc.name}" and create a new file?`,
          )
        ) {
          return;
        }

        openRequest.current += 1;
        useDocumentStore.getState().open({
          path: null,
          name: nextUntitledName(),
          kind: "markdown",
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

      openFile: async (path: string) => {
        await actionsOpenFile(path);
      },

      saveFile: async () => {
        const doc = useDocumentStore.getState().doc;
        if (!doc) {
          push("No file is open.", "info");
          return;
        }

        const {
          path: currentPath,
          content,
          modifiedMs,
          name,
          kind,
        } = doc;

        try {
          if (currentPath === null) {
            const selected = await saveDialog({
              title: "Save File",
              defaultPath: await defaultSavePath(name),
              filters: [
                { name: "Markdown", extensions: ["md", "markdown"] },
                { name: "Text", extensions: ["txt"] },
                { name: "All files", extensions: ["*"] },
              ],
            });

            if (selected === null) return;

            const target = ensureFileExtension(selected, kind);
            const authorization = await fileSystem.authorizeNewFile(target);
            const result = await fileSystem.writeTextFile(
              authorization.path,
              content,
              null,
            );

            useDocumentStore.getState().markSaved({
              previousPath: currentPath,
              path: result.path,
              name: basename(result.path),
              kind: documentKind(result.path),
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
            previousPath: currentPath,
            path: result.path,
            name,
            kind,
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
              await actionsOpenFile(currentPath, true);
            }
            return;
          }

          reportError(error);
        }
      },

      closeFile: () => {
        const doc = useDocumentStore.getState().doc;
        if (!doc) return;

        if (
          isDocumentDirty(doc) &&
          !window.confirm(`Discard unsaved changes to "${doc.name}"?`)
        ) {
          return;
        }

        openRequest.current += 1;
        useDocumentStore.getState().close();
        push("File closed.", "info");
      },

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
