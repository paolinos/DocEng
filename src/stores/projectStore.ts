import { create } from "zustand";
import type { Project, ProjectRoot } from "../types";

function createEmptyProject(): Project {
  return {
    version: 1,
    name: "Untitled Project",
    roots: [],
  };
}

export interface ProjectRestoreMetadata {
  projectPath: string | null;
  projectFilePath: string | null;
  projectFileModifiedMs: number | null;
  dirty: boolean;
}

interface ProjectState {
  project: Project;
  projectPath: string | null;
  projectFilePath: string | null;
  projectFileModifiedMs: number | null;
  dirty: boolean;
  explorerRevision: number;

  setName: (name: string) => void;
  setRoots: (roots: ProjectRoot[]) => void;
  addRoot: (root: ProjectRoot) => void;
  replaceProject: (project: Project, projectPath: string | null) => void;
  restoreProject: (project: Project, metadata: ProjectRestoreMetadata) => void;
  setProjectFile: (path: string | null, modifiedMs?: number | null) => void;
  markProjectSaved: (metadata: {
    path: string;
    modifiedMs: number | null;
    name?: string;
  }) => void;
  newProject: () => void;
  markDirty: () => void;
  markClean: () => void;
  bumpExplorerRevision: () => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: createEmptyProject(),
  projectPath: null,
  projectFilePath: null,
  projectFileModifiedMs: null,
  dirty: false,
  explorerRevision: 0,

  setName: (name) =>
    set((state) => ({
      project: { ...state.project, name },
      dirty: true,
    })),

  setRoots: (roots) =>
    set((state) => ({
      project: { ...state.project, roots },
      dirty: true,
      explorerRevision: state.explorerRevision + 1,
    })),

  addRoot: (root) =>
    set((state) => ({
      project: { ...state.project, roots: [...state.project.roots, root] },
      dirty: true,
      explorerRevision: state.explorerRevision + 1,
    })),

  replaceProject: (project, projectPath) =>
    set((state) => ({
      project,
      projectPath,
      projectFilePath: null,
      projectFileModifiedMs: null,
      dirty: false,
      explorerRevision: state.explorerRevision + 1,
    })),

  restoreProject: (project, metadata) =>
    set((state) => ({
      project,
      projectPath: metadata.projectPath,
      projectFilePath: metadata.projectFilePath,
      projectFileModifiedMs: metadata.projectFileModifiedMs,
      dirty: metadata.dirty,
      explorerRevision: state.explorerRevision + 1,
    })),

  setProjectFile: (path, modifiedMs = null) =>
    set({
      projectFilePath: path,
      projectFileModifiedMs: modifiedMs,
    }),

  markProjectSaved: ({ path, modifiedMs, name }) =>
    set((state) => ({
      projectFilePath: path,
      projectFileModifiedMs: modifiedMs,
      project: name ? { ...state.project, name } : state.project,
      dirty: false,
    })),

  newProject: () =>
    set((state) => ({
      project: createEmptyProject(),
      projectPath: null,
      projectFilePath: null,
      projectFileModifiedMs: null,
      dirty: false,
      explorerRevision: state.explorerRevision + 1,
    })),

  markDirty: () => set({ dirty: true }),
  markClean: () => set({ dirty: false }),
  bumpExplorerRevision: () =>
    set((state) => ({ explorerRevision: state.explorerRevision + 1 })),
}));

export const selectHasWorkspace = (state: ProjectState): boolean =>
  state.project.roots.length > 0 || state.projectFilePath !== null;

export const selectCanSaveProject = (state: ProjectState): boolean =>
  state.project.roots.length > 0;
