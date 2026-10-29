import type {
  DocumentKind,
  OpenDocument,
  ProjectRoot,
  ProjectRootType,
} from "../types";

export const SESSION_VERSION = 1;

export interface SessionRootSnapshot {
  id: string;
  path: string;
  type: ProjectRootType;
}

export interface SessionProjectSnapshot {
  name: string;
  projectPath: string | null;
  projectFilePath: string | null;
  projectFileModifiedMs: number | null;
  dirty: boolean;
  roots: SessionRootSnapshot[];
}

export interface SessionDocumentSnapshot {
  id: string;
  path: string | null;
  name: string;
  kind: DocumentKind;
  content: string;
  savedContent: string;
  size: number;
  modifiedMs: number | null;
}

export interface SessionSnapshot {
  version: number;
  activeDocumentId: string | null;
  project: SessionProjectSnapshot;
  documents: SessionDocumentSnapshot[];
}

export function rootToSnapshot(root: ProjectRoot): SessionRootSnapshot {
  return { id: root.id, path: root.path, type: root.type };
}

export function documentToSnapshot(doc: OpenDocument): SessionDocumentSnapshot {
  return {
    id: doc.id,
    path: doc.path,
    name: doc.name,
    kind: doc.kind,
    content: doc.content,
    savedContent: doc.savedContent,
    size: doc.size,
    modifiedMs: doc.modifiedMs,
  };
}

/**
 * Validates an untrusted session payload (for example from SQLite). A single
 * malformed row invalidates the whole snapshot so a partial restore cannot
 * silently drop tabs or project roots.
 */
export function parseSessionSnapshot(value: unknown): SessionSnapshot | null {
  if (!isRecord(value)) return null;
  if (value.version !== SESSION_VERSION) return null;

  const activeDocumentId = value.activeDocumentId;
  if (!isStringOrNull(activeDocumentId)) return null;

  const project = parseProject(value.project);
  if (project === null) return null;

  if (!Array.isArray(value.documents)) return null;

  const documents: SessionDocumentSnapshot[] = [];
  const ids = new Set<string>();

  for (const item of value.documents) {
    const document = parseDocument(item);
    if (document === null || ids.has(document.id)) return null;
    ids.add(document.id);
    documents.push(document);
  }

  return {
    version: SESSION_VERSION,
    activeDocumentId,
    project,
    documents,
  };
}

function parseProject(value: unknown): SessionProjectSnapshot | null {
  if (!isRecord(value)) return null;

  if (typeof value.name !== "string") return null;
  if (!isStringOrNull(value.projectPath)) return null;
  if (!isStringOrNull(value.projectFilePath)) return null;
  if (!isNumberOrNull(value.projectFileModifiedMs)) return null;
  if (typeof value.dirty !== "boolean") return null;
  if (!Array.isArray(value.roots)) return null;

  const roots: SessionRootSnapshot[] = [];
  const ids = new Set<string>();

  for (const item of value.roots) {
    if (!isRecord(item)) return null;
    if (typeof item.id !== "string" || ids.has(item.id)) return null;
    if (typeof item.path !== "string") return null;
    if (!isRootType(item.type)) return null;

    ids.add(item.id);
    roots.push({ id: item.id, path: item.path, type: item.type });
  }

  return {
    name: value.name,
    projectPath: value.projectPath,
    projectFilePath: value.projectFilePath,
    projectFileModifiedMs: value.projectFileModifiedMs,
    dirty: value.dirty,
    roots,
  };
}

function parseDocument(value: unknown): SessionDocumentSnapshot | null {
  if (!isRecord(value)) return null;

  if (typeof value.id !== "string") return null;
  if (!isStringOrNull(value.path)) return null;
  if (typeof value.name !== "string") return null;
  if (!isDocumentKind(value.kind)) return null;
  if (typeof value.content !== "string") return null;
  if (typeof value.savedContent !== "string") return null;
  if (typeof value.size !== "number" || !Number.isFinite(value.size)) {
    return null;
  }
  if (!isNumberOrNull(value.modifiedMs)) return null;

  return {
    id: value.id,
    path: value.path,
    name: value.name,
    kind: value.kind,
    content: value.content,
    savedContent: value.savedContent,
    size: value.size,
    modifiedMs: value.modifiedMs,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNumberOrNull(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

function isRootType(value: unknown): value is ProjectRootType {
  return value === "file" || value === "folder";
}

function isDocumentKind(value: unknown): value is DocumentKind {
  return value === "markdown" || value === "text" || value === "unsupported";
}
