import { invoke } from "@tauri-apps/api/core";
import type { SessionSnapshot } from "./session";

export interface SessionLoadResult {
  snapshot: SessionSnapshot | null;
  warning: string | null;
}

export interface RestoredRoot {
  originalPath: string;
  path: string;
}

export interface RestoreRootsResult {
  roots: RestoredRoot[];
  missing: string[];
}

export const sessionDb = {
  load(): Promise<SessionLoadResult> {
    return invoke<SessionLoadResult>("session_load");
  },

  save(snapshot: SessionSnapshot): Promise<void> {
    return invoke<void>("session_save", { snapshot });
  },

  /**
   * Re-authorizes the saved project roots, skipping paths that no longer
   * exist. Returns the canonical path of every accepted root and the paths
   * that could not be restored.
   */
  restoreProjectRoots(paths: string[]): Promise<RestoreRootsResult> {
    return invoke<RestoreRootsResult>("restore_project_roots", { paths });
  },
};
