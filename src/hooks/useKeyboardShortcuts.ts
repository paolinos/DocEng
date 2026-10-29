import { useEffect } from "react";
import type { AppActions } from "./useAppActions";

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
      if (!(event.metaKey || event.ctrlKey)) return;

      if (event.key === "Tab") {
        event.preventDefault();
        actions.cycleTab(event.shiftKey ? -1 : 1);
        return;
      }

      switch (event.key.toLowerCase()) {
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
          if (event.altKey) {
            actions.newFile();
          } else {
            actions.newProject();
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
