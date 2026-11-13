use serde::Serialize;
use std::fmt;
use std::io;
use std::path::Path;

/// One project-search match. `before` + `match` + `after` equals `text`, which
/// lets the frontend highlight without computing byte/UTF-16 offsets.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub path: String,
    pub name: String,
    pub line: usize,
    pub column: usize,
    pub text: String,
    pub before: String,
    #[serde(rename = "match")]
    pub match_text: String,
    pub after: String,
}

/// Payload returned by the project-wide search command.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchInProjectResponse {
    pub total_matches: usize,
    pub results: Vec<SearchHit>,
    pub truncated: bool,
    pub files_searched: usize,
}

/// Serializable error shape returned to the React frontend.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
}

impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            path: None,
        }
    }

    pub fn with_path(mut self, path: impl Into<String>) -> Self {
        self.path = Some(path.into());
        self
    }

    pub fn io(path: &Path, error: io::Error) -> Self {
        let code = match error.kind() {
            io::ErrorKind::NotFound => "not_found",
            io::ErrorKind::PermissionDenied => "permission_denied",
            io::ErrorKind::AlreadyExists => "already_exists",
            io::ErrorKind::InvalidInput => "invalid_input",
            _ => "io_error",
        };

        Self::new(code, error.to_string()).with_path(path.display().to_string())
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::new("internal_error", message)
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

pub type AppResult<T> = Result<T, AppError>;
