import { useEffect } from "react";
import type { AppActions } from "./useAppActions";
import { useSearchStore } from "../stores/searchStore";

/**
 * Global keyboard shortcuts. Menu shortcuts are kept in sync with MenuBar.
 */
export function useKeyboardShortcuts(
  actions: AppActions,
  enabled = true,
): void {
  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && useSearchStore.getState().findOpen) {
        const target = event.target;
        if (target instanceof Element && target.closest(".findbar")) {
          return;
        }

        event.preventDefault();
        actions.closeFind();
        document
          .querySelector<HTMLElement>(".code-editor .cm-content")
          ?.focus();
        return;
      }

      if (
        event.altKey &&
        !event.metaKey &&
        !event.ctrlKey &&
        event.code === "KeyN"
      ) {
        event.preventDefault();
        actions.newFile();
        return;
      }

      if (!(event.metaKey || event.ctrlKey)) return;

      if (event.key === "Tab") {
        event.preventDefault();
        actions.cycleTab(event.shiftKey ? -1 : 1);
        return;
      }

      switch (event.key.toLowerCase()) {
        case "f":
          event.preventDefault();
          if (event.shiftKey) {
            actions.openProjectSearch();
          } else {
            actions.openFind();
          }
          break;
        case "s":
          event.preventDefault();
          if (event.shiftKey) {
            actions.saveProject();
          } else {
            actions.saveFile();
          }
          break;
        case "w":
          event.preventDefault();
          actions.closeFile();
          break;
        case "n":
          event.preventDefault();
          if (event.shiftKey) {
            actions.newProject();
          } else {
            actions.newFile();
          }
          break;
        case "o":
          event.preventDefault();
          actions.openProject();
          break;
        case "b":
          event.preventDefault();
          actions.toggleSidebar();
          break;
        case "1":
          event.preventDefault();
          actions.setViewMode("edit");
          break;
        case "2":
          event.preventDefault();
          actions.setViewMode("split");
          break;
        case "3":
          event.preventDefault();
          actions.setViewMode("preview");
          break;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [actions, enabled]);
}
