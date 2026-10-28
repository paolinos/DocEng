export type ProjectRootType = "file" | "folder";

export interface ProjectRoot {
  id: string;
  path: string;
  type: ProjectRootType;
}

export interface Project {
  version: 1;
  name: string;
  roots: ProjectRoot[];
}

export type ViewMode = "edit" | "split" | "preview";

export type DocumentKind = "markdown" | "text" | "unsupported";

export interface OpenDocument {
  path: string | null;
  name: string;
  kind: DocumentKind;
  content: string;
  savedContent: string;
  size: number;
  modifiedMs: number | null;
}

export function isDocumentDirty(doc: OpenDocument | null): boolean {
  return (
    doc !== null && (doc.path === null || doc.content !== doc.savedContent)
  );
}

export function isMarkdownFile(path: string): boolean {
  return /\.(md|markdown)$/i.test(path);
}

export function isTextFile(path: string): boolean {
  return /\.txt$/i.test(path);
}
