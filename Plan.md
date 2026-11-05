# External File Changes and Project Entry Removal Plan

## Review

The project has no operating-system filesystem watcher today. The file tree reads folders on demand, and the existing `explorerRevision` mechanism can refresh expanded folders. Rust owns filesystem access for authorized project paths, so file watching and path reconciliation should be handled through the native layer rather than by giving the React frontend direct filesystem access.

Project files and folders are currently stored as workspace roots. Everything under a folder root appears in the tree. Removing a nested file or folder while keeping its parent folder in the project would require a new exclusion mechanism. Open documents store their path and displayed name together; clean tabs can be updated after a rename, while dirty tabs should retain their unsaved buffer. If a dirty file is renamed or deleted externally, the user needs a way to save that buffer under a new path.

## Plan

### 1. Define removal behavior (Completed)

- Implemented workspace root removal in the explorer file tree (`FileTree`, `Sidebar`, `useAppActions`).
- Workspace root removal only modifies the project definition and the Tauri native canonical path allowlist (`set_project_roots`). It never deletes files or folders on the operating system.
- Before removing a root, the app detects any open tabs belonging to that root and checks for unsaved changes (`isDocumentDirty`). A confirmation dialog explicitly clarifies that the underlying folder/file remains on disk and warns if any affected tabs have unsaved edits.
- Confirmed removal keeps affected tabs open in memory in a detached state (`detached: true`, `path: null`), preventing accidental writes back to paths no longer part of the project allowlist while ensuring no buffers or edits are lost.
- Detached tabs can be saved to any authorized destination using the existing Save As workflow.
- Updated session persistence models and migrations so detached state preserves safely across restarts.

### 2. Detect operating-system file changes

- Add a native filesystem watcher scoped to the current project roots.
- Start, stop, and reconfigure watchers when the workspace changes.
- Deliver normalized filesystem events to the frontend through Tauri.
- Debounce and coalesce event bursts; handle overlapping roots and watcher errors.
- Keep existing authorization checks: an event must not grant access to a path. Re-check paths through the existing path policy before reading them.

### 3. Refresh the project tree

- For create, delete, rename, and move events, increment the existing explorer revision so expanded folders reload.
- Refresh when a project root itself is renamed as well as when an entry inside a root changes.
- Avoid unnecessary reloads or prompts from events caused by the app’s own saves, including its atomic temporary-file-and-rename write behavior.

### 4. Reconcile open documents

- **Clean tab, renamed file:** update its path and name. Recalculate its document kind and language if the extension changed.
- **Dirty tab, renamed file:** preserve the tab as-is, including its old path, name, and unsaved buffer. Refresh the tree so the new path appears; do not silently replace or move the dirty tab.
- **Deleted file:** keep a dirty buffer available rather than closing the tab. Mark the path as missing and offer a Save As recovery path.
- **Externally modified file:** reload a clean tab if appropriate. If the tab is dirty, preserve its buffer and notify the user rather than overwriting it.
- Handle collisions where a renamed path is already open in another tab without losing either document.

### 5. Add removal controls to the explorer (Completed)

- Added an accessible remove action to project-root rows, with labels clarifying that the item remains on disk.
- Reauthorize the remaining roots after confirmation; do not update project state if reauthorization fails.
- Keep open tabs and buffers, detach tabs no longer covered by another root, and direct users to Save As for recovery.

### 6. Test the behavior

- Watcher lifecycle, workspace changes, and watcher errors.
- Create, delete, rename, and move events, including project-root changes and tree refresh.
- Clean and dirty tabs on rename or external content changes; deleted files; duplicate paths; and Save As recovery.
- Root removal, including affected dirty tabs, overlapping roots, session restoration of detached tabs, and verification that removal never deletes the OS file or folder.

## Recommended first milestone

Implement external change detection and tree refresh; update clean tabs after rename; preserve dirty tabs and buffers; and allow removal of project roots without deleting disk data. Treat nested-item exclusions as a separate product decision because they require a project-format change.

## Scope decision to confirm

Should removal apply only to files and folders explicitly added as project roots, or should users also be able to exclude a file or subfolder inside an added folder?
