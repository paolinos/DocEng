# DocEng

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
      `Ctrl/Cmd+O`, `Ctrl/Cmd+S`, `Ctrl/Cmd+Shift+S`, `Ctrl/Cmd+W`,
      `Ctrl/Cmd+Tab`, `Ctrl/Cmd+1/2/3`)
- [x] Zustand stores for project, document, UI, and notifications
- [x] Rust filesystem commands with a canonical-path allowlist
- [x] Atomic text-file writes, UTF-8 / binary / size checks, mtime conflicts
- [x] Rust unit tests for the filesystem, path-policy, and session layers
- [x] Native folder/file pickers with project-root authorization
- [x] Lazy explorer tree backed by `list_directory`
- [x] Multiple documents in a scrollable tab strip
- [x] Open/read text files into the editor with per-tab dirty tracking
- [x] Save with `Ctrl/Cmd+S`, mtime conflict detection, and reload recovery
- [x] Untitled documents (`Ctrl/Cmd+Alt+N`) that use a native save dialog for
      their first save
- [x] Basic Markdown preview (headings, lists, quotes, code, inline styles)
- [x] Real project YAML save, save as, and reopen
- [x] Optional projects: start with a folder or file and save the project later
- [x] SQLite session restore for the project, open tabs, tab order, active tab,
      and unsaved edits
- [x] Missing saved paths are skipped with a warning instead of aborting

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

## Tabs and session restore

Opening another file adds a tab; reopening a file that is already open activates
its existing tab instead of creating a duplicate. Switching tabs never discards
or prompts about edits. Save (`Ctrl/Cmd+S`) applies to the active tab, and
`Ctrl/Cmd+W` closes it after a per-tab discard prompt when it is dirty.
`Ctrl/Cmd+Tab` and `Ctrl/Cmd+Shift+Tab` cycle tabs. Changing projects or
creating a new one prompts once for all dirty tabs.

The project (including an unsaved implicit project), open tabs, tab order,
active tab, and unsaved buffers are restored on launch. State is stored in a
SQLite database at `<app data dir>/doceng.db`:

- Linux: `~/.local/share/com.doceng.app/doceng.db` (depending on the desktop environment)
- macOS: `~/Library/Application Support/com.doceng.app/doceng.db`
- Windows: `%APPDATA%\com.doceng.app\doceng.db`

On startup, saved project roots and files are re-authorized. Paths that no
longer exist are skipped and listed in a warning; the rest of the workspace is
still restored. Clean files are reloaded from disk, while dirty files and
untitled documents keep their in-memory contents. If the database cannot be
read, the app starts with an empty session and keeps the unreadable file as
`doceng.db.bak` when possible.

Session content is also written on every tab or project change and about half a
second after the last edit. Closing the window flushes any pending write before
the window is destroyed.

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
  components/       Menu bar, sidebar, tab strip, editor shell, status bar, toasts
  hooks/            Global shortcuts, app actions, session restore/persistence
  lib/              Tauri filesystem/session wrappers, project YAML, helpers
  stores/           Zustand: project, document tabs, UI, notifications
  types.ts          Project and document types

src-tauri/src/
  error.rs          Serializable AppError returned over IPC
  fs_ops.rs         project-root authorization, list/stat/read/write commands
  path_policy.rs    Canonical root allowlist (project boundary)
  session.rs        SQLite session schema, migrations, load/save commands
  lib.rs            Tauri builder, session DB setup, command registration
```

The Rust layer owns filesystem access. The frontend never talks to the disk
directly. Paths are canonicalized and must be inside one of the roots authorized
by the open project, which also prevents symlinks from escaping the project.
First-time saves call `authorize_new_file`, which authorizes the exact target
path without granting access to the rest of its folder.

The session database is also owned by Rust (`rusqlite`, with bundled SQLite).
Each save replaces the snapshot inside one transaction; `PRAGMA user_version`
tracks schema migrations. The frontend sends only a validated snapshot and does
not access SQLite directly.

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
- **Phase 2 — Editing:** multi-tab editing, dirty state, `Ctrl/Cmd+S`,
  conflicts, and SQLite session restore. ✅
- **Phase 3 — Markdown:** basic preview included; full GFM rendering and polish
  remain.
- **Phase 4 — Hardening:** settings, watchers, tests, packaging, session schema
  migrations.
