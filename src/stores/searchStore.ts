import { create } from "zustand";
import type { SearchHit, SearchInProjectResponse } from "../lib/fs";

export interface ProjectSearchReveal {
  path: string;
  line: number;
  column: number;
  match: string;
}

interface SearchState {
  // In-file find.
  findOpen: boolean;
  query: string;
  caseSensitive: boolean;
  activeIndex: number;
  focusRequest: number;
  revealRequest: number;

  openFind: (initialQuery?: string) => void;
  closeFind: () => void;
  setQuery: (query: string) => void;
  setCaseSensitive: (caseSensitive: boolean) => void;
  setActiveIndex: (activeIndex: number) => void;
  nextMatch: (matchCount: number) => void;
  previousMatch: (matchCount: number) => void;
  resetForDocument: () => void;

  // Project-wide search (a UI view, never persisted as a document).
  projectSearchOpen: boolean;
  projectSearchActive: boolean;
  projectQuery: string;
  projectResults: SearchHit[];
  projectLoading: boolean;
  projectTruncated: boolean;
  projectError: string | null;
  projectFilesSearched: number;
  projectHasSearched: boolean;
  projectRootsKey: string | null;
  projectRequestId: number;
  projectFocusRequest: number;
  projectReveal: ProjectSearchReveal | null;

  openProjectSearch: () => void;
  activateProjectSearch: () => void;
  deactivateProjectSearch: () => void;
  closeProjectSearch: () => void;
  setProjectQuery: (query: string) => void;
  startProjectSearch: (rootsKey: string) => number;
  finishProjectSearch: (
    requestId: number,
    response: SearchInProjectResponse,
  ) => void;
  failProjectSearch: (requestId: number, message: string) => void;
  syncProjectRoots: (rootsKey: string) => void;
  setProjectReveal: (reveal: ProjectSearchReveal) => void;
  clearProjectReveal: () => void;
}

export const useSearchStore = create<SearchState>((set) => ({
  findOpen: false,
  query: "",
  caseSensitive: false,
  activeIndex: 0,
  focusRequest: 0,
  revealRequest: 0,

  openFind: (initialQuery) =>
    set((state) => ({
      findOpen: true,
      query:
        initialQuery !== undefined
          ? initialQuery
          : state.findOpen
            ? state.query
            : "",
      activeIndex: initialQuery !== undefined ? 0 : state.activeIndex,
      focusRequest: state.focusRequest + 1,
      revealRequest: state.revealRequest + 1,
    })),

  closeFind: () => set({ findOpen: false }),

  setQuery: (query) =>
    set((state) => ({
      query,
      activeIndex: 0,
      revealRequest: state.revealRequest + 1,
    })),

  setCaseSensitive: (caseSensitive) =>
    set((state) => ({
      caseSensitive,
      activeIndex: 0,
      revealRequest: state.revealRequest + 1,
    })),

  setActiveIndex: (activeIndex) => set({ activeIndex }),

  nextMatch: (matchCount) =>
    set((state) => {
      const current =
        matchCount === 0
          ? 0
          : Math.min(state.activeIndex, matchCount - 1);

      return {
        activeIndex: matchCount === 0 ? 0 : (current + 1) % matchCount,
        revealRequest: state.revealRequest + 1,
      };
    }),

  previousMatch: (matchCount) =>
    set((state) => {
      const current =
        matchCount === 0
          ? 0
          : Math.min(state.activeIndex, matchCount - 1);

      return {
        activeIndex:
          matchCount === 0
            ? 0
            : (current - 1 + matchCount) % matchCount,
        revealRequest: state.revealRequest + 1,
      };
    }),

  resetForDocument: () =>
    set((state) => ({
      query: "",
      activeIndex: 0,
      revealRequest: state.revealRequest + 1,
    })),

  projectSearchOpen: false,
  projectSearchActive: false,
  projectQuery: "",
  projectResults: [],
  projectLoading: false,
  projectTruncated: false,
  projectError: null,
  projectFilesSearched: 0,
  projectHasSearched: false,
  projectRootsKey: null,
  projectRequestId: 0,
  projectFocusRequest: 0,
  projectReveal: null,

  openProjectSearch: () =>
    set((state) => ({
      projectSearchOpen: true,
      projectSearchActive: true,
      projectFocusRequest: state.projectFocusRequest + 1,
    })),

  activateProjectSearch: () =>
    set((state) =>
      state.projectSearchOpen
        ? {
            projectSearchActive: true,
            projectFocusRequest: state.projectFocusRequest + 1,
          }
        : state,
    ),

  deactivateProjectSearch: () => set({ projectSearchActive: false }),

  closeProjectSearch: () =>
    set((state) => ({
      projectSearchOpen: false,
      projectSearchActive: false,
      projectQuery: "",
      projectResults: [],
      projectLoading: false,
      projectTruncated: false,
      projectError: null,
      projectFilesSearched: 0,
      projectHasSearched: false,
      projectReveal: null,
      projectRequestId: state.projectRequestId + 1,
    })),

  setProjectQuery: (projectQuery) => set({ projectQuery }),

  startProjectSearch: (rootsKey) => {
    let requestId = 0;

    set((state) => {
      requestId = state.projectRequestId + 1;
      return {
        projectRootsKey: rootsKey,
        projectRequestId: requestId,
        projectLoading: true,
        projectError: null,
        projectTruncated: false,
        projectResults: [],
        projectFilesSearched: 0,
        projectHasSearched: false,
        projectReveal: null,
      };
    });

    return requestId;
  },

  finishProjectSearch: (requestId, response) =>
    set((state) =>
      requestId !== state.projectRequestId
        ? state
        : {
            projectLoading: false,
            projectError: null,
            projectResults: response.results,
            projectTruncated: response.truncated,
            projectFilesSearched: response.filesSearched,
            projectHasSearched: true,
          },
    ),

  failProjectSearch: (requestId, message) =>
    set((state) =>
      requestId !== state.projectRequestId
        ? state
        : {
            projectLoading: false,
            projectError: message,
            projectHasSearched: true,
          },
    ),

  syncProjectRoots: (rootsKey) =>
    set((state) => {
      if (state.projectRootsKey === rootsKey) return state;
      if (state.projectRootsKey === null) return { projectRootsKey: rootsKey };

      return {
        projectRootsKey: rootsKey,
        projectRequestId: state.projectRequestId + 1,
        projectResults: [],
        projectLoading: false,
        projectTruncated: false,
        projectError: null,
        projectFilesSearched: 0,
        projectHasSearched: false,
        projectReveal: null,
      };
    }),

  setProjectReveal: (projectReveal) => set({ projectReveal }),

  clearProjectReveal: () => set({ projectReveal: null }),
}));
