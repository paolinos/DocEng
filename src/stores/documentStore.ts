import { create } from "zustand";
import type {
  DocumentKind,
  ImagePreviewData,
  OpenDocument,
  OpenDocumentInput,
} from "../types";
import {
  documentKindForPath,
  documentLanguageForPath,
  isDocumentDirty,
} from "../types";
import { createId } from "../lib/utils";

export interface DocumentSaveMetadata {
  id: string;
  path: string;
  name: string;
  kind: DocumentKind;
  language: string | null;
  image: ImagePreviewData | null;
  content: string;
  size: number;
  modifiedMs: number | null;
}

interface DocumentState {
  documents: OpenDocument[];
  activeId: string | null;
  openDocument: (doc: OpenDocumentInput, activate?: boolean) => string;
  restoreDocuments: (documents: OpenDocument[], activeId: string | null) => void;
  activateDocument: (id: string) => void;
  cycleDocument: (direction: 1 | -1) => void;
  updateContent: (id: string, content: string) => void;
  replaceDocument: (id: string, doc: OpenDocumentInput) => void;
  detachDocumentsUnderRoot: (
    path: string,
    isFolder: boolean,
    remainingRoots: Array<{ path: string; type: "file" | "folder" }>,
  ) => void;
  renameDocumentsUnderPath: (path: string, isFolder: boolean, newPath: string) => void;
  detachDocumentsUnderPath: (path: string, isFolder: boolean) => void;
  markSaved: (metadata: DocumentSaveMetadata) => void;
  closeDocument: (id: string) => void;
  closeAllDocuments: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  documents: [],
  activeId: null,

  openDocument: (doc, activate = true) => {
    const id = createId("doc");

    set((state) => ({
      documents: [...state.documents, { ...doc, id }],
      activeId: activate ? id : (state.activeId ?? id),
    }));

    return id;
  },

  restoreDocuments: (documents, activeId) => {
    const validActiveId =
      activeId && documents.some((doc) => doc.id === activeId)
        ? activeId
        : (documents[documents.length - 1]?.id ?? null);

    set({ documents, activeId: validActiveId });
  },

  activateDocument: (id) =>
    set((state) =>
      state.documents.some((doc) => doc.id === id) ? { activeId: id } : state,
    ),

  cycleDocument: (direction) =>
    set((state) => {
      if (state.documents.length < 2) return state;

      const current = state.documents.findIndex(
        (doc) => doc.id === state.activeId,
      );
      const start = current < 0 ? 0 : current;
      const next =
        (start + direction + state.documents.length) % state.documents.length;

      return { activeId: state.documents[next].id };
    }),

  updateContent: (id, content) =>
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...doc, content } : doc,
      ),
    })),

  replaceDocument: (id, replacement) =>
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id ? { ...replacement, id } : doc,
      ),
    })),

  detachDocumentsUnderRoot: (path, isFolder, remainingRoots) =>
    set((state) => ({
      documents: state.documents.map((doc) => {
        if (
          doc.path === null ||
          !(doc.path === path || (isFolder && isWithinRoot(doc.path, path)))
        ) {
          return doc;
        }

        // Overlapping project roots may continue to authorize this path. Keep
        // the tab attached when another remaining root still covers it.
        if (
          remainingRoots.some(
            (root) =>
              doc.path === root.path ||
              (root.type === "folder" && isWithinRoot(doc.path!, root.path)),
          )
        ) {
          return doc;
        }

        return {
          ...doc,
          path: null,
          name: doc.name,
          modifiedMs: null,
          detached: true,
        };
      }),
    })),

  renameDocumentsUnderPath: (path, isFolder, newPath) =>
    set((state) => ({
      documents: state.documents.map((doc) => {
        if (
          doc.path === null ||
          !(doc.path === path || (isFolder && isWithinRoot(doc.path, path)))
        ) {
          return doc;
        }
        const suffix = doc.path.slice(path.length);
        const renamedPath = `${newPath}${suffix}`;
        const kind = documentKindForPath(renamedPath);
        return {
          ...doc,
          path: renamedPath,
          name: renamedPath.split(/[\\/]/).pop() ?? doc.name,
          kind,
          language: documentLanguageForPath(renamedPath, kind),
        };
      }),
    })),

  detachDocumentsUnderPath: (path, isFolder) =>
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.path !== null &&
        (doc.path === path || (isFolder && isWithinRoot(doc.path, path)))
          ? { ...doc, path: null, modifiedMs: null, detached: true }
          : doc,
      ),
    })),

  markSaved: ({
    id,
    path,
    name,
    kind,
    language,
    image,
    content,
    size,
    modifiedMs,
  }) =>
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id
          ? {
              ...doc,
              path,
              name,
              kind,
              language,
              image,
              savedContent: content,
              size,
              modifiedMs,
              detached: false,
            }
          : doc,
      ),
    })),

  closeDocument: (id) =>
    set((state) => {
      const index = state.documents.findIndex((doc) => doc.id === id);
      if (index < 0) return state;

      const documents = state.documents.filter((doc) => doc.id !== id);
      let activeId = state.activeId;

      if (activeId === id) {
        activeId = documents[index]?.id ?? documents[index - 1]?.id ?? null;
      }

      return { documents, activeId };
    }),

  closeAllDocuments: () => set({ documents: [], activeId: null }),
}));

export const selectActiveDocument = (
  state: DocumentState,
): OpenDocument | null =>
  state.documents.find((doc) => doc.id === state.activeId) ?? null;

export const selectActivePath = (state: DocumentState): string | null =>
  state.documents.find((doc) => doc.id === state.activeId)?.path ?? null;

export const selectDirtyDocuments = (state: DocumentState): OpenDocument[] =>
  state.documents.filter((doc) => isDocumentDirty(doc));

export function findDocumentByPath(
  state: DocumentState,
  path: string,
): OpenDocument | undefined {
  return state.documents.find((doc) => doc.path === path);
}

function isWithinRoot(path: string, root: string): boolean {
  return path.startsWith(`${root}/`) || path.startsWith(`${root}\\`);
}
