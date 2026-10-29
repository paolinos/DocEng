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
  id: string;
  path: string | null;
  name: string;
  kind: DocumentKind;
  content: string;
  savedContent: string;
  size: number;
  modifiedMs: number | null;
}

export type OpenDocumentInput = Omit<OpenDocument, "id">;

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

export function documentKindForPath(path: string): DocumentKind {
  if (isMarkdownFile(path)) return "markdown";
  if (isTextFile(path)) return "text";
  return "unsupported";
}
