# DocEng — Project Context

## What this is

DocEng is a project-based desktop text/Markdown editor built with **Tauri 2**, **React 19**, **TypeScript**, and **Vite**. A project is a named list of folders and files (saved as a small YAML file), and the app provides a multi-tab editor with Markdown preview, project search, and session restore.

## Current status

- Core editing features are complete: shell, menus, project file tree, multi-tab editing, dirty-state tracking, save/save-as, mtime conflict detection, and SQLite session restore.
- Markdown preview is basic (headings, lists, quotes, code, inline styles, Mermaid, and embedded C4 diagrams). Full GFM rendering is still pending.
- Still planned: operating-system file watchers, settings, tests, and packaging.

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite |
| Desktop | Tauri 2, Rust |
| State | Zustand |
| Editor | CodeMirror 6 |
| Persistence | SQLite via `rusqlite` in Rust |
| Styling | Plain CSS (`src/App.css`) |

## Project structure

```
src/
  App.tsx                 App shell
  main.tsx                Entry point
  components/
    ui/                   App shell / general-purpose UI
                          (MenuBar, Sidebar, EditorPane, FileTree, etc.)
                          Re-exported from `components/ui/index.ts`.
    preview/              Document-type preview components
                          (MarkdownPreview, C4Preview, ImagePreview,
                           ApiSpecPreview for OpenAPI/AsyncAPI)
                          Re-exported from `components/preview/index.ts`.
    diagram/              Shared diagram rendering primitives
                          (C4Diagram, C4DiagramImpl, MermaidDiagram)
  hooks/                  Global hooks: useAppActions, useKeyboardShortcuts,
                          useSessionRestore, useSessionPersistence
  lib/                    Frontend helpers and wrappers
    fs.ts                 Tauri filesystem IPC wrapper
    projectFile.ts        Project YAML serializer/parser
    session.ts            Session snapshot helpers
    sessionDb.ts          Rust session DB wrapper
    search.ts             In-editor search helpers
    platform.ts           macOS/Windows/Linux shortcut helpers
    utils.ts              Small utilities
  stores/                 Zustand stores
    projectStore.ts       Project/workspace state
    documentStore.ts      Open tabs and dirty state
    uiStore.ts            Sidebar, view mode, layout
    toastStore.ts         Notification toasts
    confirmStore.ts       Promise-based confirmation modal
    searchStore.ts        Find/project-search UI state
  types.ts                Shared TypeScript types

src-tauri/src/
  lib.rs                  Tauri builder + command registration
  fs_ops.rs               File read/write/list/stat/rename/trash/search commands
  path_policy.rs          Canonical root allowlist
  session.rs              SQLite schema, migrations, load/save
  error.rs                Serializable AppError type
```

## Architecture principles

- **Rust owns filesystem access.** The frontend never touches the disk directly. All file operations go through Tauri commands.
- **Project roots are an allowlist.** `set_project_roots` canonicalizes the workspace and restricts reads/writes to those paths. Symlinks cannot escape.
- **First-time saves are explicitly authorized.** `authorize_new_file` grants access to an exact target path without opening its whole parent folder.
- **Dirty tracking is in-memory.** A document is dirty when `content !== savedContent`, or when it is an untitled file. Images are read-only.
- **Sessions are snapshots.** On every change the frontend sends a JSON snapshot to Rust, which stores it in SQLite. The snapshot includes project state, open tabs, active tab, and unsaved buffer content.

## State stores

| Store | Responsibility |
|-------|----------------|
| `projectStore` | Project name/roots, `projectFilePath`, `dirty`, `explorerRevision` |
| `documentStore` | Open documents, active tab, content updates, save metadata, detach/rename |
| `uiStore` | Sidebar width/collapse, view mode (`edit`/`split`/`preview`) |
| `toastStore` | Notification queue |
| `searchStore` | Find bar, project search, results |
| `confirmStore` | Promise-based yes/no confirmation modal |

Use `store.getState()` for reads inside actions and the selector hooks for React subscriptions.

## Filesystem flow

- Adding a folder/file → `authorizeRoots` → `setProjectRoots`.
- Opening a file → `readTextFile` / `readImageFile` → open or activate tab.
- Saving a file → `writeTextFile` with `expectedModifiedMs` for conflict detection.
- Saving a project → `serializeProject` → `writeTextFile`.
- Opening a project YAML → parse → canonicalize roots → replace workspace.

## Session restore

- Rust SQLite DB lives at the app data dir (`com.doceng.app/doceng.db`).
- On launch, `useSessionRestore` loads the snapshot, re-authorizes roots, skips missing paths with a warning, reloads clean files from disk, and restores dirty buffers from the snapshot.
- `useSessionPersistence` writes on tab/project changes and debounces content edits by 500 ms. It also flushes on window close and visibility hidden.

## Editor & previews

- CodeMirror 6 with a custom dark theme (`src/lib/editorTheme.ts`).
- Markdown files get full Markdown parsing + highlighted fenced code blocks.
- Code files are classified by extension or filename (see `src/types.ts`) and colored by language.
- Images (`png`, `jpg`, `jpeg`, `webp`) are preview-only as base64 data URLs.

## Supported preview formats

| Format | Detection | Preview component |
|--------|-----------|-------------------|
| Markdown | `.md` / `.markdown` extension | `MarkdownPreview` |
| OpenAPI / AsyncAPI | YAML files containing a top-level `openapi:` or `asyncapi:` key (`src/lib/apiSpec.ts`) | `ApiSpecPreview` — uses `swagger-ui-react` for OpenAPI and `@asyncapi/react-component` for AsyncAPI |
| LikeC4 / C4 | `.c4` or `.likec4` extension, or `likec4`/`c4` fenced code block in Markdown | `C4Preview` / `C4Diagram` via the `likec4` library; right-click a C4 file to export all views as a single `.drawio` file |
| Mermaid | `mermaid` fenced code block in Markdown | `MermaidDiagram` |

## Search

- `Ctrl/Cmd+F`: inline find in the active buffer (case-sensitive toggle).
- `Ctrl/Cmd+Shift+F`: project search across authorized roots. Rust performs a literal, case-insensitive substring search and returns grouped results. Binary/invalid-UTF-8/large files and common build folders are skipped.

## Keyboard shortcuts (current)

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd+N` | New file |
| `Alt+N` (`Option+N`) | New file |
| `Ctrl/Cmd+Shift+N` | New project |
| `Ctrl/Cmd+O` | Open project file |
| `Ctrl/Cmd+S` | Save active file |
| `Ctrl/Cmd+Shift+S` | Save project |
| `Ctrl/Cmd+W` | Close active tab |
| `Ctrl/Cmd+Tab` / `Ctrl/Cmd+Shift+Tab` | Cycle tabs |
| `Ctrl/Cmd+F` | Find |
| `Ctrl/Cmd+Shift+F` | Find in project |
| `Ctrl/Cmd+B` | Toggle sidebar |
| `Ctrl/Cmd+1/2/3` | Editor / split / preview view mode |

> The in-app menu bar mirrors these shortcuts via `formatShortcut()` in `src/lib/platform.ts`.

## Project file format

A saved project is plain YAML:

```yaml
version: 1
name: My Notes
roots:
  - path: "/home/me/notes"
    type: folder
  - path: "/home/me/todo.md"
    type: file
```

`src/lib/projectFile.ts` reads and writes this with a small hand-written parser; strings are JSON-quoted for safety, which is valid YAML.

## Development commands

```bash
# Install deps and run the Tauri app
npm install
make run

# Type-check frontend
npm run typecheck

# Build frontend bundle
npm run build

# Backend tests
cd src-tauri && cargo test

# All tests
make test
```

## Notes for agents

- Keep filesystem logic in Rust. Add new commands in `src-tauri/src/fs_ops.rs` and register them in `lib.rs`.
- Use the existing Zustand stores rather than local state for global concerns.
- Reuse the existing `.confirm-backdrop` / `.confirm-dialog` CSS classes for modals, or use `confirmStore` + `ConfirmModal` for yes/no prompts.
- Toasts are pushed through `toastStore` (`push(message, kind, duration?)`).
- When adding a new keyboard shortcut, update both `useKeyboardShortcuts.ts` and the menu bar label in `MenuBar.tsx` so they stay in sync.
- Session persistence is automatic; be careful about serializable state and avoid storing large transient data in stores.
- `npm test` currently has a pre-existing `ts-jest` resolution issue in this environment; rely on `npm run typecheck` and `cargo test` for verification.
- LikeC4's layout layer imports `node:events`. The Vite build aliases `node:events` to the `events` package so it works in the browser. Do not remove `events` from dependencies or the alias in `vite.config.ts` without checking that the production build still runs.
