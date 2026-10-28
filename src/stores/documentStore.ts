import { create } from "zustand";
import type { DocumentKind, OpenDocument } from "../types";

interface SaveMetadata {
  previousPath: string | null;
  path: string;
  name: string;
  kind: DocumentKind;
  content: string;
  size: number;
  modifiedMs: number | null;
}

interface DocumentState {
  doc: OpenDocument | null;
  open: (doc: OpenDocument) => void;
  updateContent: (content: string) => void;
  markSaved: (metadata: SaveMetadata) => void;
  close: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  doc: null,

  open: (doc) => set({ doc }),

  updateContent: (content) =>
    set((state) => (state.doc ? { doc: { ...state.doc, content } } : state)),

  markSaved: ({ previousPath, path, name, kind, content, size, modifiedMs }) =>
    set((state) => {
      if (!state.doc || state.doc.path !== previousPath) return state;

      return {
        doc: {
          ...state.doc,
          path,
          name,
          kind,
          savedContent: content,
          size,
          modifiedMs,
        },
      };
    }),

  close: () => set({ doc: null }),
}));
