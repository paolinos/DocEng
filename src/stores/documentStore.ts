import { create } from "zustand";
import type {
  DocumentKind,
  OpenDocument,
  OpenDocumentInput,
} from "../types";
import { createId } from "../lib/utils";

export interface DocumentSaveMetadata {
  id: string;
  path: string;
  name: string;
  kind: DocumentKind;
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

  markSaved: ({ id, path, name, kind, content, size, modifiedMs }) =>
    set((state) => ({
      documents: state.documents.map((doc) =>
        doc.id === id
          ? {
              ...doc,
              path,
              name,
              kind,
              savedContent: content,
              size,
              modifiedMs,
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
  state.documents.filter(
    (doc) => doc.path === null || doc.content !== doc.savedContent,
  );

export function findDocumentByPath(
  state: DocumentState,
  path: string,
): OpenDocument | undefined {
  return state.documents.find((doc) => doc.path === path);
}
