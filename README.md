# docu

A project-based desktop editor for plain text and Markdown files, built with
**Tauri 2**, **React 19**, **TypeScript**, and **Vite**.

Projects can be saved in a YAML file: a name plus a list of folders and files
to show in the explorer. The left sidebar shows the project tree; the right pane
is the editor.

## Status — projects, file I/O, and Markdown

Phases 0–2 are complete, with a basic Markdown preview from Phase 3:

- [x] Tauri 2 + React + TypeScript + Vite scaffold
- [x] 30 / 70 workspace with a draggable divider and collapsible sidebar
- [x] In-app menu bar: Project, File, View, Help
- [x] Keyboard shortcuts (`Ctrl/Cmd+B`, `Ctrl/Cmd+N`, `Ctrl/Cmd+Alt+N`,
      `Ctrl/Cmd+O`, `Ctrl/Cmd+S`, `Ctrl/Cmd+Shift+S`, `Ctrl/Cmd+1/2/3`)
- [x] Zustand stores for project, document, UI, and notifications
- [x] Rust filesystem commands with a canonical-path allowlist
- [x] Atomic text-file writes, UTF-8 / binary / size checks, mtime conflicts
- [x] Rust unit tests for the filesystem and path-policy layers
- [x] Native folder/file pickers with project-root authorization
- [x] Lazy explorer tree backed by `list_directory`
- [x] Open/read text files into the editor with dirty tracking
- [x] Save with `Ctrl/Cmd+S`, mtime conflict detection, and reload recovery
- [x] Temporary untitled documents (`Ctrl/Cmd+Alt+N`) that prompt on discard
      and use a native save dialog for their first save
- [x] Basic Markdown preview (headings, lists, quotes, code, inline styles)
- [x] Real project YAML save, save as, and reopen
- [x] Optional projects: start with a folder or file and save the project later

Folders, files, and documents can be opened from a cold start without creating
a project first. Adding a folder or file, or saving a new document, starts an
implicit `Untitled Project` in memory. Save Project and Save Project As stay
disabled until the workspace has at least one folder or file.

The first time the project YAML is saved, an implicit `Untitled Project` takes
its name from the chosen filename (for example, `notes.yaml` becomes `notes`).
Once saved, Save Project overwrites that file and Save Project As writes a new
one. The project file is not added as an explorer root; the app re-authorizes
the exact project file path before each save.

New files are kept in memory under an `Untitled-N.md` name until the first
save. The first save asks for a destination; saving outside the current project
adds that exact file to the workspace so it can still be read and written
later.

## Prerequisites

- Node.js 20+
- Rust stable (1.77+; developed with 1.97)
- Linux only: WebKitGTK and GTK development packages

```bash
sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev \
  libayatana-appindicator3-dev patchelf
```

## Development

```bash
npm install
npm run tauri dev
```

Frontend-only checks:

```bash
npm run typecheck
npm run build
```

Backend tests:

```bash
cd src-tauri
cargo test
```

## Architecture

```
src/
  components/       Menu bar, sidebar, editor shell, status bar, toasts
  hooks/            Global shortcuts and app actions
  lib/              Tauri filesystem wrappers, project YAML, shared helpers
  stores/           Zustand: project, document, UI, notifications
  types.ts          Project and document types

src-tauri/src/
  error.rs          Serializable AppError returned over IPC
  fs_ops.rs         project-root authorization, list/stat/read/write commands
  path_policy.rs    Canonical root allowlist (project boundary)
  lib.rs            Tauri builder and command registration
```

The Rust layer owns filesystem access. The frontend never talks to the disk
directly. Paths are canonicalized and must be inside one of the roots authorized
by the open project, which also prevents symlinks from escaping the project.
First-time saves call `authorize_new_file`, which authorizes the exact target
path without granting access to the rest of its folder.

## Project file

`Open Project…` (`Ctrl/Cmd+O`) opens a `.yaml` / `.yml` project file.
`Open Folder as Project…` keeps the older folder-only flow and starts a new
project named after the folder. A saved project looks like this:

```yaml
version: 1
name: My Notes
roots:
  - path: /home/me/notes
    type: folder
  - path: /home/me/todo.md
    type: file
```

The frontend writes this small schema directly in `src/lib/projectFile.ts`; it
quotes scalar values as JSON strings, which are valid YAML double-quoted
scalars, so no YAML dependency is required. The parser intentionally rejects
unknown keys and versions rather than silently dropping project data. On open,
each root is canonicalized and authorized again, so a project file can only
reference paths the user is still allowed to access.

## Roadmap

- **Phase 0 — Foundation:** shell, menus, stores, filesystem layer. ✅
- **Phase 1 — Projects:** folder/file pickers, add files/folders, file tree,
  YAML save/save-as/open. ✅
- **Phase 2 — Editing:** load, edit, dirty state, `Ctrl/Cmd+S`, conflicts. ✅
- **Phase 3 — Markdown:** basic preview included; full GFM rendering and polish
  remain.
- **Phase 4 — Hardening:** settings, watchers, tests, packaging.
