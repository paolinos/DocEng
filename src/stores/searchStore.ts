import { create } from "zustand";

interface SearchState {
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
}));
