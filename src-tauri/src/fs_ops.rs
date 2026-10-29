use crate::error::{AppError, AppResult};
use crate::path_policy::PathPolicy;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::Serialize;
use std::ffi::OsStr;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::State;

const MAX_TEXT_FILE_BYTES: u64 = 10 * 1024 * 1024;
const MAX_IMAGE_FILE_BYTES: u64 = 20 * 1024 * 1024;
const BINARY_SAMPLE_BYTES: usize = 8 * 1024;

const PNG_MAGIC: [u8; 8] = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
const JPEG_MAGIC: [u8; 3] = [0xFF, 0xD8, 0xFF];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PathInfo {
    pub path: String,
    pub name: String,
    pub is_dir: bool,
    pub is_file: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified_ms: Option<u64>,
    pub extension: Option<String>,
}

impl PathInfo {
    fn from_metadata(path: PathBuf, metadata: &fs::Metadata, is_symlink: bool) -> Self {
        Self {
            name: file_name(&path),
            extension: extension(&path),
            path: path.to_string_lossy().into_owned(),
            is_dir: metadata.is_dir(),
            is_file: metadata.is_file(),
            is_symlink,
            size: metadata.len(),
            modified_ms: modified_ms(metadata),
        }
    }

    fn unreadable(path: PathBuf, is_symlink: bool) -> Self {
        Self {
            name: file_name(&path),
            extension: extension(&path),
            path: path.to_string_lossy().into_owned(),
            is_dir: false,
            is_file: false,
            is_symlink,
            size: 0,
            modified_ms: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextFileInfo {
    pub path: String,
    pub content: String,
    pub size: u64,
    pub modified_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageFileInfo {
    pub path: String,
    pub mime_type: String,
    pub data_url: String,
    pub size: u64,
    pub modified_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteTextResult {
    pub path: String,
    pub size: u64,
    pub modified_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewFileAuthorization {
    pub path: String,
    pub added: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoredRoot {
    pub original_path: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreRootsResult {
    pub roots: Vec<RestoredRoot>,
    pub missing: Vec<String>,
}

#[tauri::command]
pub fn list_directory(path: String, policy: State<'_, PathPolicy>) -> AppResult<Vec<PathInfo>> {
    let canonical = policy.allow(Path::new(&path))?;
    list_directory_impl(&canonical)
}

#[tauri::command]
pub fn stat_path(path: String, policy: State<'_, PathPolicy>) -> AppResult<PathInfo> {
    let canonical = policy.allow(Path::new(&path))?;
    stat_path_impl(&canonical)
}

#[tauri::command]
pub fn canonicalize_path(path: String, policy: State<'_, PathPolicy>) -> AppResult<String> {
    let canonical = policy.allow(Path::new(&path))?;
    Ok(canonical.to_string_lossy().into_owned())
}

/// Authorizes the folders and files that make up the open project.
///
/// This is the bridge between the project state in React and the canonical
/// path allowlist in Rust. Every read/write command checks that its path stays
/// inside one of these roots. An empty list clears the allowlist.
#[tauri::command]
pub fn set_project_roots(
    paths: Vec<String>,
    policy: State<'_, PathPolicy>,
) -> AppResult<Vec<String>> {
    let roots = paths.into_iter().map(PathBuf::from).collect::<Vec<_>>();
    let canonical = policy.set_roots(roots)?;

    Ok(canonical
        .into_iter()
        .map(|path| path.to_string_lossy().into_owned())
        .collect())
}

/// Authorizes the exact destination of a first-time save.
#[tauri::command]
pub fn authorize_new_file(
    path: String,
    policy: State<'_, PathPolicy>,
) -> AppResult<NewFileAuthorization> {
    let (canonical, added) = policy.allow_new_file(Path::new(&path))?;

    Ok(NewFileAuthorization {
        path: canonical.to_string_lossy().into_owned(),
        added,
    })
}

/// Re-authorizes saved project roots during startup, skipping any path that
/// no longer exists or can no longer be canonicalized.
#[tauri::command]
pub fn restore_project_roots(
    paths: Vec<String>,
    policy: State<'_, PathPolicy>,
) -> AppResult<RestoreRootsResult> {
    restore_project_roots_impl(paths, &policy)
}

fn restore_project_roots_impl(
    paths: Vec<String>,
    policy: &PathPolicy,
) -> AppResult<RestoreRootsResult> {
    let mut accepted = Vec::new();
    let mut canonical_for_policy: Vec<PathBuf> = Vec::new();
    let mut missing = Vec::new();

    for original in paths {
        let path = Path::new(&original);

        if !path.is_absolute() {
            missing.push(original);
            continue;
        }

        match path.canonicalize() {
            Ok(canonical) if canonical.exists() => {
                accepted.push(RestoredRoot {
                    original_path: original,
                    path: canonical.to_string_lossy().into_owned(),
                });

                if !canonical_for_policy.contains(&canonical) {
                    canonical_for_policy.push(canonical);
                }
            }
            _ => missing.push(original),
        }
    }

    policy.set_roots(canonical_for_policy)?;

    Ok(RestoreRootsResult {
        roots: accepted,
        missing,
    })
}

#[tauri::command]
pub fn read_text_file(path: String, policy: State<'_, PathPolicy>) -> AppResult<TextFileInfo> {
    let canonical = policy.allow(Path::new(&path))?;
    read_text_file_impl(&canonical)
}

#[tauri::command]
pub fn read_image_file(path: String, policy: State<'_, PathPolicy>) -> AppResult<ImageFileInfo> {
    let canonical = policy.allow(Path::new(&path))?;
    read_image_file_impl(&canonical)
}

#[tauri::command]
pub fn write_text_file(
    path: String,
    content: String,
    expected_modified_ms: Option<u64>,
    policy: State<'_, PathPolicy>,
) -> AppResult<WriteTextResult> {
    let canonical = policy.allow(Path::new(&path))?;
    write_text_file_impl(&canonical, &content, expected_modified_ms)
}

fn list_directory_impl(path: &Path) -> AppResult<Vec<PathInfo>> {
    let metadata = fs::metadata(path).map_err(|error| AppError::io(path, error))?;
    if !metadata.is_dir() {
        return Err(
            AppError::new("not_a_directory", "Path is not a directory.")
                .with_path(path.display().to_string()),
        );
    }

    let mut entries = Vec::new();

    for entry in fs::read_dir(path).map_err(|error| AppError::io(path, error))? {
        let entry = entry.map_err(|error| AppError::io(path, error))?;
        let entry_path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| AppError::io(&entry_path, error))?;
        let is_symlink = file_type.is_symlink();

        match fs::metadata(&entry_path) {
            Ok(metadata) => entries.push(PathInfo::from_metadata(
                entry_path,
                &metadata,
                is_symlink,
            )),
            Err(_) if is_symlink => {
                entries.push(PathInfo::unreadable(entry_path, true))
            }
            Err(error) => {
                // A single unreadable entry should not make the whole directory
                // unusable. Broken/permission-denied entries are reported as
                // metadata-less placeholders instead.
                if error.kind() == std::io::ErrorKind::PermissionDenied {
                    entries.push(PathInfo::unreadable(entry_path, is_symlink));
                } else {
                    return Err(AppError::io(&entry_path, error));
                }
            }
        }
    }

    entries.sort_by(|left, right| {
        right
            .is_dir
            .cmp(&left.is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    Ok(entries)
}

fn stat_path_impl(path: &Path) -> AppResult<PathInfo> {
    let symlink_metadata =
        fs::symlink_metadata(path).map_err(|error| AppError::io(path, error))?;
    let is_symlink = symlink_metadata.file_type().is_symlink();

    match fs::metadata(path) {
        Ok(metadata) => Ok(PathInfo::from_metadata(path.to_path_buf(), &metadata, is_symlink)),
        Err(_) if is_symlink => Ok(PathInfo::unreadable(path.to_path_buf(), true)),
        Err(error) => Err(AppError::io(path, error)),
    }
}

fn read_text_file_impl(path: &Path) -> AppResult<TextFileInfo> {
    let metadata = fs::metadata(path).map_err(|error| AppError::io(path, error))?;

    if !metadata.is_file() {
        return Err(
            AppError::new("not_a_file", "Path is not a regular file.")
                .with_path(path.display().to_string()),
        );
    }

    if metadata.len() > MAX_TEXT_FILE_BYTES {
        return Err(AppError::new(
            "file_too_large",
            format!(
                "File is {} bytes; the text editor limit is {} bytes.",
                metadata.len(),
                MAX_TEXT_FILE_BYTES
            ),
        )
        .with_path(path.display().to_string()));
    }

    let mut file = File::open(path).map_err(|error| AppError::io(path, error))?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.read_to_end(&mut bytes)
        .map_err(|error| AppError::io(path, error))?;

    if bytes
        .iter()
        .take(BINARY_SAMPLE_BYTES)
        .any(|byte| *byte == 0)
    {
        return Err(
            AppError::new("binary_file", "File appears to contain binary data.")
                .with_path(path.display().to_string()),
        );
    }

    let content = String::from_utf8(bytes).map_err(|_| {
        AppError::new("invalid_utf8", "File is not valid UTF-8.")
            .with_path(path.display().to_string())
    })?;

    Ok(TextFileInfo {
        path: path.to_string_lossy().into_owned(),
        content,
        size: metadata.len(),
        modified_ms: modified_ms(&metadata),
    })
}

fn image_mime_for_extension(extension: &str) -> Option<&'static str> {
    match extension {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "webp" => Some("image/webp"),
        _ => None,
    }
}

fn image_magic_matches(extension: &str, bytes: &[u8]) -> bool {
    match extension {
        "png" => bytes.starts_with(&PNG_MAGIC),
        "jpg" | "jpeg" => bytes.starts_with(&JPEG_MAGIC),
        "webp" => {
            bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP"
        }
        _ => false,
    }
}

fn read_image_file_impl(path: &Path) -> AppResult<ImageFileInfo> {
    let metadata = fs::metadata(path).map_err(|error| AppError::io(path, error))?;

    if !metadata.is_file() {
        return Err(
            AppError::new("not_a_file", "Path is not a regular file.")
                .with_path(path.display().to_string()),
        );
    }

    if metadata.len() > MAX_IMAGE_FILE_BYTES {
        return Err(AppError::new(
            "image_too_large",
            format!(
                "Image is {} bytes; the preview limit is {} bytes.",
                metadata.len(),
                MAX_IMAGE_FILE_BYTES
            ),
        )
        .with_path(path.display().to_string()));
    }

    let extension = path
        .extension()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_lowercase();

    let mime_type = image_mime_for_extension(&extension).ok_or_else(|| {
        AppError::new(
            "unsupported_image",
            "Only PNG, JPEG, and WebP images are supported.",
        )
        .with_path(path.display().to_string())
    })?;

    let mut file = File::open(path).map_err(|error| AppError::io(path, error))?;
    // Read one byte past the limit so a file that grew after the metadata check
    // is still rejected without loading unbounded data into memory.
    let mut bytes = Vec::with_capacity(metadata.len() as usize + 1);
    let mut limited = Read::take(&mut file, MAX_IMAGE_FILE_BYTES + 1);
    limited
        .read_to_end(&mut bytes)
        .map_err(|error| AppError::io(path, error))?;

    if bytes.len() as u64 > MAX_IMAGE_FILE_BYTES {
        return Err(AppError::new(
            "image_too_large",
            format!(
                "Image exceeds the {} byte preview limit.",
                MAX_IMAGE_FILE_BYTES
            ),
        )
        .with_path(path.display().to_string()));
    }

    if !image_magic_matches(&extension, &bytes) {
        return Err(
            AppError::new("invalid_image", "Image data does not match its file type.")
                .with_path(path.display().to_string()),
        );
    }

    let data_url = format!("data:{mime_type};base64,{}", BASE64.encode(&bytes));

    Ok(ImageFileInfo {
        path: path.to_string_lossy().into_owned(),
        mime_type: mime_type.to_string(),
        data_url,
        size: metadata.len(),
        modified_ms: modified_ms(&metadata),
    })
}

fn write_text_file_impl(
    path: &Path,
    content: &str,
    expected_modified_ms: Option<u64>,
) -> AppResult<WriteTextResult> {
    let mut existing_permissions = None;

    match fs::metadata(path) {
        Ok(metadata) => {
            if !metadata.is_file() {
                return Err(
                    AppError::new("not_a_file", "Path is not a regular file.")
                        .with_path(path.display().to_string()),
                );
            }

            if let Some(expected) = expected_modified_ms {
                if modified_ms(&metadata) != Some(expected) {
                    return Err(AppError::new(
                        "conflict",
                        "The file changed on disk since it was opened.",
                    )
                    .with_path(path.display().to_string()));
                }
            }

            existing_permissions = Some(metadata.permissions());
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            if expected_modified_ms.is_some() {
                return Err(AppError::new(
                    "conflict",
                    "The file no longer exists on disk.",
                )
                .with_path(path.display().to_string()));
            }
        }
        Err(error) => return Err(AppError::io(path, error)),
    }

    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .ok_or_else(|| {
            AppError::new("invalid_input", "Path has no parent directory.")
                .with_path(path.display().to_string())
        })?;

    if !parent.is_dir() {
        return Err(
            AppError::new("parent_missing", "The parent directory does not exist.")
                .with_path(parent.display().to_string()),
        );
    }

    let file_name = path.file_name().ok_or_else(|| {
        AppError::new("invalid_input", "Path has no file name.")
            .with_path(path.display().to_string())
    })?;

    let temp_path = temporary_path(parent, file_name);

    let write_result = (|| -> AppResult<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|error| AppError::io(&temp_path, error))?;

        if let Some(permissions) = existing_permissions {
            file.set_permissions(permissions)
                .map_err(|error| AppError::io(&temp_path, error))?;
        }

        file.write_all(content.as_bytes())
            .map_err(|error| AppError::io(&temp_path, error))?;
        file.sync_all()
            .map_err(|error| AppError::io(&temp_path, error))?;

        Ok(())
    })();

    if let Err(error) = write_result {
        let _ = fs::remove_file(&temp_path);
        return Err(error);
    }

    if let Err(error) = fs::rename(&temp_path, path) {
        let _ = fs::remove_file(&temp_path);
        return Err(AppError::io(path, error));
    }

    let metadata = fs::metadata(path).map_err(|error| AppError::io(path, error))?;

    Ok(WriteTextResult {
        path: path.to_string_lossy().into_owned(),
        size: metadata.len(),
        modified_ms: modified_ms(&metadata),
    })
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(OsStr::to_str)
        .unwrap_or_default()
        .to_string()
}

fn extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(OsStr::to_str)
        .map(|extension| extension.to_lowercase())
}

fn modified_ms(metadata: &fs::Metadata) -> Option<u64> {
    metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
}

fn temporary_path(parent: &Path, file_name: &OsStr) -> PathBuf {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    parent.join(format!(
        ".{}.docu-{}-{}.tmp",
        file_name.to_string_lossy(),
        std::process::id(),
        stamp
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn authorized_policy(root: &Path) -> PathPolicy {
        let policy = PathPolicy::default();
        policy
            .set_roots([root.to_path_buf()])
            .expect("set project roots");
        policy
    }

    #[test]
    fn writes_and_reads_a_text_file() {
        let dir = tempdir().expect("temp dir");
        let file = dir.path().join("note.md");
        let policy = authorized_policy(dir.path());

        let authorized = policy.allow(&file).expect("file should be allowed");
        let written = write_text_file_impl(&authorized, "# Hello\n", None).expect("write file");
        assert_eq!(written.size, 8);

        let read = read_text_file_impl(&authorized).expect("read file");
        assert_eq!(read.content, "# Hello\n");
        assert_eq!(read.size, 8);
    }

    #[test]
    fn rejects_a_stale_modified_time() {
        let dir = tempdir().expect("temp dir");
        let file = dir.path().join("note.txt");
        fs::write(&file, "first").expect("write fixture");
        let policy = authorized_policy(dir.path());
        let authorized = policy.allow(&file).expect("file should be allowed");

        let stale = read_text_file_impl(&authorized)
            .expect("read file")
            .modified_ms
            .unwrap_or_default()
            + 5_000;

        let error = write_text_file_impl(&authorized, "second", Some(stale))
            .expect_err("stale write must be rejected");
        assert_eq!(error.code, "conflict");
    }

    #[test]
    fn rejects_binary_files() {
        let dir = tempdir().expect("temp dir");
        let file = dir.path().join("image.bin");
        fs::write(&file, [0_u8, 1, 2, 3]).expect("write fixture");

        let error = read_text_file_impl(&file).expect_err("binary file must be rejected");
        assert_eq!(error.code, "binary_file");
    }

    fn png_fixture() -> Vec<u8> {
        vec![
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ]
    }

    fn jpeg_fixture() -> Vec<u8> {
        vec![
            0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
        ]
    }

    fn webp_fixture() -> Vec<u8> {
        let mut bytes = b"RIFF\x24\x00\x00\x00WEBPVP8 ".to_vec();
        bytes.extend_from_slice(&[0_u8; 16]);
        bytes
    }

    #[test]
    fn reads_supported_image_formats() {
        let dir = tempdir().expect("temp dir");
        let cases = [
            ("pixel.png", png_fixture(), "image/png"),
            ("photo.jpg", jpeg_fixture(), "image/jpeg"),
            ("photo.jpeg", jpeg_fixture(), "image/jpeg"),
            ("shot.webp", webp_fixture(), "image/webp"),
        ];

        for (name, bytes, mime) in cases {
            let file = dir.path().join(name);
            fs::write(&file, &bytes).expect("write fixture");

            let info = read_image_file_impl(&file).expect("read image");
            assert_eq!(info.mime_type, mime);
            assert_eq!(info.size, bytes.len() as u64);
            assert!(info.data_url.starts_with(&format!("data:{mime};base64,")));

            let payload = info
                .data_url
                .strip_prefix(&format!("data:{mime};base64,"))
                .expect("data url prefix");
            assert_eq!(BASE64.decode(payload).expect("decode"), bytes);
        }
    }

    #[test]
    fn rejects_unsupported_image_extensions() {
        let dir = tempdir().expect("temp dir");
        let file = dir.path().join("animation.gif");
        fs::write(&file, png_fixture()).expect("write fixture");

        let error = read_image_file_impl(&file).expect_err("gif must be rejected");
        assert_eq!(error.code, "unsupported_image");
    }

    #[test]
    fn rejects_images_with_mismatched_magic_bytes() {
        let dir = tempdir().expect("temp dir");
        let file = dir.path().join("fake.png");
        fs::write(&file, jpeg_fixture()).expect("write fixture");

        let error = read_image_file_impl(&file).expect_err("mismatched magic must be rejected");
        assert_eq!(error.code, "invalid_image");
    }

    #[test]
    fn rejects_oversized_images() {
        let dir = tempdir().expect("temp dir");
        let file = dir.path().join("huge.png");
        let handle = File::create(&file).expect("create fixture");
        handle
            .set_len(MAX_IMAGE_FILE_BYTES + 1)
            .expect("size fixture");

        let error = read_image_file_impl(&file).expect_err("oversize image must be rejected");
        assert_eq!(error.code, "image_too_large");
    }

    #[test]
    fn image_reads_require_authorization() {
        let dir = tempdir().expect("temp dir");
        let other = tempdir().expect("other dir");
        let file = dir.path().join("pixel.png");
        fs::write(&file, png_fixture()).expect("write fixture");
        let policy = authorized_policy(other.path());

        let error = policy.allow(&file).expect_err("outside root must be rejected");
        assert_eq!(error.code, "not_allowed");
    }

    #[test]
    fn refuses_to_read_image_from_a_directory() {
        let dir = tempdir().expect("temp dir");
        let folder = dir.path().join("pictures.png");
        fs::create_dir(&folder).expect("create dir");

        let error = read_image_file_impl(&folder).expect_err("must reject directory");
        assert_eq!(error.code, "not_a_file");
    }

    #[test]
    fn lists_directories_with_folders_first() {
        let dir = tempdir().expect("temp dir");
        fs::create_dir(dir.path().join("zeta")).expect("create dir");
        fs::create_dir(dir.path().join("alpha")).expect("create dir");
        fs::write(dir.path().join("note.md"), "note").expect("write file");

        let entries = list_directory_impl(dir.path()).expect("list directory");
        let names: Vec<&str> = entries.iter().map(|entry| entry.name.as_str()).collect();

        assert_eq!(names, vec!["alpha", "zeta", "note.md"]);
        assert!(entries[0].is_dir);
        assert!(entries[2].is_file);
    }

    #[test]
    fn refuses_to_write_through_a_directory() {
        let dir = tempdir().expect("temp dir");
        let nested = dir.path().join("nested");
        fs::create_dir(&nested).expect("create dir");

        let error = write_text_file_impl(&nested, "no", None).expect_err("must reject directory");
        assert_eq!(error.code, "not_a_file");
    }

    #[test]
    fn restores_existing_roots_and_skips_missing_ones() {
        let dir = tempdir().expect("temp dir");
        let folder = dir.path().join("notes");
        fs::create_dir(&folder).expect("create folder");
        let file = folder.join("todo.md");
        fs::write(&file, "todo").expect("write fixture");
        let missing = dir.path().join("gone").to_string_lossy().into_owned();

        let policy = PathPolicy::default();
        let result = restore_project_roots_impl(
            vec![folder.to_string_lossy().into_owned(), missing.clone()],
            &policy,
        )
        .expect("restore roots");

        assert_eq!(result.roots.len(), 1);
        assert_eq!(result.missing, vec![missing]);
        assert!(policy.allow(&file).is_ok());
    }

    #[test]
    fn restoring_no_roots_clears_authorization() {
        let dir = tempdir().expect("temp dir");
        let policy = authorized_policy(dir.path());
        let file = dir.path().join("note.md");
        fs::write(&file, "note").expect("write fixture");
        assert!(policy.allow(&file).is_ok());

        let result = restore_project_roots_impl(vec![], &policy).expect("restore roots");
        assert!(result.roots.is_empty());
        assert_eq!(
            policy.allow(&file).expect_err("must clear").code,
            "not_allowed"
        );
    }

    #[test]
    fn restore_skips_relative_roots() {
        let policy = PathPolicy::default();
        let result = restore_project_roots_impl(vec!["relative/folder".into()], &policy)
            .expect("restore roots");

        assert!(result.roots.is_empty());
        assert_eq!(result.missing, vec!["relative/folder"]);
        assert!(policy.roots().is_empty());
    }
}
