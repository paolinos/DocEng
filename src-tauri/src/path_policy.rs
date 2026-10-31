use crate::error::{AppError, AppResult};
use std::path::{Path, PathBuf};
use std::sync::RwLock;

/// Holds the canonical paths authorized by the currently open project.
///
/// The frontend calls `set_project_roots` whenever the project's folders or
/// files change, so every read/write command works against the same allowlist.
#[derive(Default)]
pub struct PathPolicy {
    roots: RwLock<Vec<PathBuf>>,
}

impl PathPolicy {
    /// Replaces the authorized roots. Called while opening a project and after
    /// adding a path. Passing an empty list clears authorization.
    pub fn set_roots<I>(&self, roots: I) -> AppResult<Vec<PathBuf>>
    where
        I: IntoIterator<Item = PathBuf>,
    {
        let mut canonical_roots = Vec::new();

        for root in roots {
            if !root.is_absolute() {
                return Err(AppError::new(
                    "invalid_input",
                    "Project paths must be absolute.",
                )
                .with_path(root.display().to_string()));
            }

            let canonical = root
                .canonicalize()
                .map_err(|error| AppError::io(&root, error))?;

            if !canonical.exists() {
                return Err(AppError::new("not_found", "Project path does not exist.")
                    .with_path(canonical.display().to_string()));
            }

            if !canonical_roots.contains(&canonical) {
                canonical_roots.push(canonical);
            }
        }

        let mut guard = self
            .roots
            .write()
            .map_err(|_| AppError::internal("Path policy lock is poisoned."))?;
        *guard = canonical_roots.clone();

        Ok(canonical_roots)
    }

    #[allow(dead_code)]
    pub fn roots(&self) -> Vec<PathBuf> {
        self.roots
            .read()
            .map(|guard| guard.clone())
            .unwrap_or_default()
    }

    /// Canonicalizes `path` and verifies that it lives inside one of the
    /// project roots. New files are checked through their canonical parent.
    pub fn allow(&self, path: &Path) -> AppResult<PathBuf> {
        if !path.is_absolute() {
            return Err(AppError::new("invalid_input", "Path must be absolute.")
                .with_path(path.display().to_string()));
        }

        let canonical = canonicalize_target(path)?;

        let roots = self
            .roots
            .read()
            .map_err(|_| AppError::internal("Path policy lock is poisoned."))?;

        if roots.is_empty() {
            return Err(AppError::new(
                "not_allowed",
                "No project paths are authorized yet. Open a project first.",
            )
            .with_path(canonical.display().to_string()));
        }

        if roots.iter().any(|root| canonical.starts_with(root)) {
            Ok(canonical)
        } else {
            Err(AppError::new(
                "not_allowed",
                "Path is outside the folders and files of the open project.",
            )
            .with_path(canonical.display().to_string()))
        }
    }

    /// Renames an authorized entry inside its current directory and updates any
    /// affected project roots while holding the authorization lock.
    pub fn rename_entry(&self, path: &Path, new_name: &str) -> AppResult<PathBuf> {
        use std::path::Component;

        let mut components = Path::new(new_name).components();
        if new_name.trim().is_empty()
            || !matches!(components.next(), Some(Component::Normal(_)))
            || components.next().is_some()
        {
            return Err(AppError::new("invalid_input", "Enter a valid name without a path."));
        }

        let source = self.authorized_entry(path)?;
        let parent = source.parent().ok_or_else(|| {
            AppError::new("invalid_input", "Source has no parent directory.")
                .with_path(source.display().to_string())
        })?;
        let destination = parent.join(new_name);
        if destination == source {
            return Ok(source);
        }
        if std::fs::symlink_metadata(&destination).is_ok() {
            return Err(AppError::new("already_exists", "An item with that name already exists.")
                .with_path(destination.display().to_string()));
        }

        std::fs::rename(&source, &destination)
            .map_err(|error| AppError::io(&source, error))?;

        let mut roots = self
            .roots
            .write()
            .map_err(|_| AppError::internal("Path policy lock is poisoned."))?;
        for root in roots.iter_mut() {
            if let Ok(relative) = root.strip_prefix(&source) {
                *root = destination.join(relative);
            }
        }

        Ok(destination)
    }

    /// Moves an authorized entry to the operating system trash and removes
    /// project roots that point into the trashed entry.
    pub fn trash_entry(&self, path: &Path) -> AppResult<()> {
        let canonical = self.authorized_entry(path)?;
        trash::delete(&canonical).map_err(|error| {
            AppError::new("trash_failed", error.to_string())
                .with_path(canonical.display().to_string())
        })?;

        let mut roots = self
            .roots
            .write()
            .map_err(|_| AppError::internal("Path policy lock is poisoned."))?;
        roots.retain(|root| !root.starts_with(&canonical));
        Ok(())
    }

    /// Canonicalizes the parent without following the entry itself and verifies
    /// that it remains within one of the configured project roots.
    fn authorized_entry(&self, path: &Path) -> AppResult<PathBuf> {
        if !path.is_absolute() {
            return Err(AppError::new("invalid_input", "Path must be absolute.")
                .with_path(path.display().to_string()));
        }

        let file_name = path.file_name().ok_or_else(|| {
            AppError::new("invalid_input", "Path has no file name.")
                .with_path(path.display().to_string())
        })?;
        let parent = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
            .ok_or_else(|| {
                AppError::new("invalid_input", "Path has no parent directory.")
                    .with_path(path.display().to_string())
            })?
            .canonicalize()
            .map_err(|error| AppError::io(path, error))?;
        let canonical = parent.join(file_name);
        if std::fs::symlink_metadata(&canonical).is_err() {
            return Err(AppError::new("not_found", "Path does not exist.")
                .with_path(canonical.display().to_string()));
        }

        let roots = self
            .roots
            .read()
            .map_err(|_| AppError::internal("Path policy lock is poisoned."))?;
        if roots.iter().any(|root| canonical.starts_with(root)) {
            Ok(canonical)
        } else {
            Err(AppError::new(
                "not_allowed",
                "Path is outside the folders and files of the open project.",
            )
            .with_path(canonical.display().to_string()))
        }
    }

    /// Authorizes an exact save target that may not exist yet.
    ///
    /// If the target is already inside a project root, it is covered by the
    /// existing authorization. Otherwise the canonical file path itself is
    /// added as a least-privilege root. Returns the canonical path and whether
    /// a new exact-file root had to be added.
    pub fn allow_new_file(&self, path: &Path) -> AppResult<(PathBuf, bool)> {
        if !path.is_absolute() {
            return Err(AppError::new("invalid_input", "Path must be absolute.")
                .with_path(path.display().to_string()));
        }

        let canonical = canonicalize_target(path)?;

        if canonical.is_dir() {
            return Err(
                AppError::new("not_a_file", "Save target is a directory.")
                    .with_path(canonical.display().to_string()),
            );
        }

        let mut roots = self
            .roots
            .write()
            .map_err(|_| AppError::internal("Path policy lock is poisoned."))?;

        let covered = roots.iter().any(|root| canonical.starts_with(root));

        if !covered {
            roots.push(canonical.clone());
        }

        Ok((canonical, !covered))
    }
}

fn canonicalize_target(path: &Path) -> AppResult<PathBuf> {
    if path.exists() {
        return path
            .canonicalize()
            .map_err(|error| AppError::io(path, error));
    }

    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| {
            AppError::new("invalid_input", "Path has no parent directory.")
                .with_path(path.display().to_string())
        })?;

    let file_name = path.file_name().ok_or_else(|| {
        AppError::new("invalid_input", "Path has no file name.")
            .with_path(path.display().to_string())
    })?;

    let canonical_parent = parent
        .canonicalize()
        .map_err(|error| AppError::io(parent, error))?;

    Ok(canonical_parent.join(file_name))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn allows_paths_inside_a_root() {
        let dir = tempdir().expect("temp dir");
        let file = dir.path().join("note.md");
        std::fs::write(&file, "hello").expect("write fixture");

        let policy = PathPolicy::default();
        policy
            .set_roots([dir.path().to_path_buf()])
            .expect("set roots");

        let allowed = policy.allow(&file).expect("file should be allowed");
        assert_eq!(allowed, file.canonicalize().expect("canonical file"));
    }

    #[test]
    fn allows_new_files_through_their_parent() {
        let dir = tempdir().expect("temp dir");
        let policy = PathPolicy::default();
        policy
            .set_roots([dir.path().to_path_buf()])
            .expect("set roots");

        let new_file = dir.path().join("draft.md");
        let allowed = policy.allow(&new_file).expect("new file should be allowed");
        assert_eq!(allowed, new_file);
    }

    #[test]
    fn rejects_paths_outside_all_roots() {
        let inside = tempdir().expect("inside temp dir");
        let outside = tempdir().expect("outside temp dir");
        let file = outside.path().join("secret.md");
        std::fs::write(&file, "secret").expect("write fixture");

        let policy = PathPolicy::default();
        policy
            .set_roots([inside.path().to_path_buf()])
            .expect("set roots");

        let error = policy.allow(&file).expect_err("path must be rejected");
        assert_eq!(error.code, "not_allowed");
    }

    #[test]
    fn rejects_relative_paths() {
        let policy = PathPolicy::default();
        let error = policy
            .allow(Path::new("relative.md"))
            .expect_err("relative path must be rejected");
        assert_eq!(error.code, "invalid_input");
    }

    #[test]
    fn authorizes_a_new_file_inside_an_existing_root() {
        let dir = tempdir().expect("temp dir");
        let policy = PathPolicy::default();
        policy
            .set_roots([dir.path().to_path_buf()])
            .expect("set roots");

        let new_file = dir.path().join("draft.md");
        let (canonical, added) = policy
            .allow_new_file(&new_file)
            .expect("new file should be authorized");

        let expected = new_file
            .parent()
            .expect("parent")
            .canonicalize()
            .expect("canonical parent")
            .join("draft.md");

        assert!(!added);
        assert_eq!(canonical, expected);
        assert!(policy.allow(&new_file).is_ok());
    }

    #[test]
    fn authorizes_a_new_file_outside_roots_by_adding_the_exact_file() {
        let inside = tempdir().expect("inside temp dir");
        let outside = tempdir().expect("outside temp dir");
        let policy = PathPolicy::default();
        policy
            .set_roots([inside.path().to_path_buf()])
            .expect("set roots");

        let new_file = outside.path().join("draft.md");
        let (canonical, added) = policy
            .allow_new_file(&new_file)
            .expect("new file should be authorized");

        let expected = new_file
            .parent()
            .expect("parent")
            .canonicalize()
            .expect("canonical parent")
            .join("draft.md");

        assert!(added);
        assert_eq!(canonical, expected);
        assert!(policy.allow(&new_file).is_ok());
        assert_eq!(policy.roots().len(), 2);
    }

    #[test]
    fn rejects_relative_new_file_paths() {
        let policy = PathPolicy::default();
        let error = policy
            .allow_new_file(Path::new("relative.md"))
            .expect_err("relative path must be rejected");
        assert_eq!(error.code, "invalid_input");
    }
}
