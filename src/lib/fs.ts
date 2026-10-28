import { invoke } from "@tauri-apps/api/core";

/**
 * Rust-side path metadata. Field names are camelCased by serde.
 */
export interface PathInfo {
  path: string;
  name: string;
  isDir: boolean;
  isFile: boolean;
  isSymlink: boolean;
  size: number;
  modifiedMs: number | null;
  extension: string | null;
}

export interface TextFileInfo {
  path: string;
  content: string;
  size: number;
  modifiedMs: number | null;
}

export interface WriteTextResult {
  path: string;
  size: number;
  modifiedMs: number | null;
}

export interface NewFileAuthorization {
  path: string;
  added: boolean;
}

export interface AppError {
  code: string;
  message: string;
  path?: string;
}

export function isAppError(error: unknown): error is AppError {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    "message" in error &&
    typeof (error as AppError).message === "string"
  );
}

export function errorMessage(error: unknown): string {
  if (isAppError(error)) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

export const fileSystem = {
  /**
   * Registers the project's folders/files as the only paths the Rust side is
   * allowed to read or write. Returns the canonical form of each root.
   */
  setProjectRoots(paths: string[]): Promise<string[]> {
    return invoke<string[]>("set_project_roots", { paths });
  },

  /**
   * Authorizes an exact save target that may not exist yet. Used when an
   * untitled document is saved for the first time.
   */
  authorizeNewFile(path: string): Promise<NewFileAuthorization> {
    return invoke<NewFileAuthorization>("authorize_new_file", { path });
  },

  listDirectory(path: string): Promise<PathInfo[]> {
    return invoke<PathInfo[]>("list_directory", { path });
  },

  statPath(path: string): Promise<PathInfo> {
    return invoke<PathInfo>("stat_path", { path });
  },

  readTextFile(path: string): Promise<TextFileInfo> {
    return invoke<TextFileInfo>("read_text_file", { path });
  },

  writeTextFile(
    path: string,
    content: string,
    expectedModifiedMs?: number | null,
  ): Promise<WriteTextResult> {
    return invoke<WriteTextResult>("write_text_file", {
      path,
      content,
      expectedModifiedMs: expectedModifiedMs ?? null,
    });
  },

  canonicalizePath(path: string): Promise<string> {
    return invoke<string>("canonicalize_path", { path });
  },
};
