import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ViewMode } from "../types";
import { clamp } from "../lib/utils";

export const SIDEBAR_MIN = 20;
export const SIDEBAR_MAX = 50;
export const SIDEBAR_DEFAULT = 30;

interface UiState {
  sidebarWidth: number;
  sidebarCollapsed: boolean;
  viewMode: ViewMode;
  setSidebarWidth: (width: number) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  setViewMode: (mode: ViewMode) => void;
  resetLayout: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarWidth: SIDEBAR_DEFAULT,
      sidebarCollapsed: false,
      viewMode: "split",

      setSidebarWidth: (width) =>
        set({ sidebarWidth: clamp(width, SIDEBAR_MIN, SIDEBAR_MAX) }),

      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      setViewMode: (viewMode) => set({ viewMode }),

      resetLayout: () =>
        set({
          sidebarWidth: SIDEBAR_DEFAULT,
          sidebarCollapsed: false,
          viewMode: "split",
        }),
    }),
    {
      name: "doceng.ui",
      version: 1,
      partialize: (state) => ({
        sidebarWidth: state.sidebarWidth,
        sidebarCollapsed: state.sidebarCollapsed,
        viewMode: state.viewMode,
      }),
    },
  ),
);
