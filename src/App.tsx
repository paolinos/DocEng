import type { CSSProperties } from "react";
import { MenuBar } from "./components/MenuBar";
import { Sidebar } from "./components/Sidebar";
import { ResizeHandle } from "./components/ResizeHandle";
import { EditorPane } from "./components/EditorPane";
import { StatusBar } from "./components/StatusBar";
import { Toaster } from "./components/Toaster";
import { useAppActions } from "./hooks/useAppActions";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useUiStore } from "./stores/uiStore";
import "./App.css";

function App() {
  const actions = useAppActions();
  useKeyboardShortcuts(actions);

  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);

  const bodyStyle = {
    "--sidebar-width": `${sidebarWidth}%`,
  } as CSSProperties;

  return (
    <div className="app">
      <MenuBar actions={actions} />

      <div
        className={
          sidebarCollapsed ? "app__body app__body--collapsed" : "app__body"
        }
        style={bodyStyle}
      >
        <Sidebar actions={actions} />
        {sidebarCollapsed ? null : <ResizeHandle width={sidebarWidth} />}
        <EditorPane actions={actions} />
      </div>

      <StatusBar />
      <Toaster />
    </div>
  );
}

export default App;
