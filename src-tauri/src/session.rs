use crate::error::{AppError, AppResult};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, State};

const SNAPSHOT_VERSION: i64 = 1;
const SCHEMA_VERSION: i64 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionSnapshot {
    pub version: i64,
    pub active_document_id: Option<String>,
    pub project: SessionProject,
    pub documents: Vec<SessionDocument>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionProject {
    pub name: String,
    pub project_path: Option<String>,
    pub project_file_path: Option<String>,
    pub project_file_modified_ms: Option<i64>,
    pub dirty: bool,
    pub roots: Vec<SessionRoot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRoot {
    pub id: String,
    pub path: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionDocument {
    pub id: String,
    pub path: Option<String>,
    pub name: String,
    pub kind: String,
    pub content: String,
    pub saved_content: String,
    pub size: i64,
    pub modified_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionLoadResult {
    pub snapshot: Option<SessionSnapshot>,
    pub warning: Option<String>,
}

/// Owns the SQLite connection used for session persistence.
///
/// Initialization failures are not fatal: the app still starts with an empty
/// session and the reason is surfaced once through `session_load`.
pub struct SessionDb {
    connection: Mutex<Option<Connection>>,
    warning: Mutex<Option<String>>,
}

impl SessionDb {
    pub fn initialize(app: &AppHandle) -> Self {
        let path = match app.path().app_data_dir() {
            Ok(directory) => directory.join("docu.db"),
            Err(error) => {
                return Self {
                    connection: Mutex::new(None),
                    warning: Mutex::new(Some(format!(
                        "Could not locate the application data directory: {error}"
                    ))),
                };
            }
        };

        match open_database(&path) {
            Ok(connection) => Self {
                connection: Mutex::new(Some(connection)),
                warning: Mutex::new(None),
            },
            Err(error) => {
                // Keep the unreadable database for inspection, then start over.
                let backup = backup_path(&path);
                let moved = move_to_backup(&path, &backup);

                match open_database(&path) {
                    Ok(connection) => Self {
                        connection: Mutex::new(Some(connection)),
                        warning: Mutex::new(Some(if moved {
                            format!(
                                "The saved session could not be read ({error}). A backup was kept at {} and a new session was started.",
                                backup.display()
                            )
                        } else {
                            format!(
                                "The saved session could not be read ({error}). A new session was started."
                            )
                        })),
                    },
                    Err(second_error) => Self {
                        connection: Mutex::new(None),
                        warning: Mutex::new(Some(format!(
                            "Session persistence is unavailable: {second_error}"
                        ))),
                    },
                }
            }
        }
    }
}

#[tauri::command]
pub fn session_load(db: State<'_, SessionDb>) -> AppResult<SessionLoadResult> {
    let warning = db.warning.lock().ok().and_then(|mut value| value.take());
    let guard = db
        .connection
        .lock()
        .map_err(|_| AppError::internal("Session database lock is poisoned."))?;

    let Some(connection) = guard.as_ref() else {
        return Ok(SessionLoadResult {
            snapshot: None,
            warning,
        });
    };

    let snapshot = load_snapshot(connection)?;

    Ok(SessionLoadResult { snapshot, warning })
}

#[tauri::command]
pub fn session_save(snapshot: SessionSnapshot, db: State<'_, SessionDb>) -> AppResult<()> {
    let mut guard = db
        .connection
        .lock()
        .map_err(|_| AppError::internal("Session database lock is poisoned."))?;

    let Some(connection) = guard.as_mut() else {
        return Err(AppError::new(
            "session_unavailable",
            "Session persistence is unavailable.",
        ));
    };

    save_snapshot(connection, &snapshot)
}

fn open_database(path: &Path) -> AppResult<Connection> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| AppError::io(parent, error))?;
    }

    let connection = Connection::open(path).map_err(|error| {
        AppError::internal(format!("Could not open the session database: {error}"))
    })?;

    connection
        .busy_timeout(Duration::from_secs(5))
        .map_err(db_error)?;

    connection
        .execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;",
        )
        .map_err(db_error)?;

    migrate(&connection)?;

    Ok(connection)
}

fn migrate(connection: &Connection) -> AppResult<()> {
    let version: i64 = connection
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .map_err(db_error)?;

    if version > SCHEMA_VERSION {
        return Err(AppError::new(
            "incompatible_session",
            format!(
                "Session database version {version} is newer than this app supports."
            ),
        ));
    }

    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS session (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                version INTEGER NOT NULL,
                active_document_id TEXT
            );

            CREATE TABLE IF NOT EXISTS project (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                name TEXT NOT NULL,
                project_path TEXT,
                project_file_path TEXT,
                project_file_modified_ms INTEGER,
                dirty INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS project_roots (
                id TEXT PRIMARY KEY,
                position INTEGER NOT NULL,
                path TEXT NOT NULL,
                root_type TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                position INTEGER NOT NULL,
                path TEXT,
                name TEXT NOT NULL,
                kind TEXT NOT NULL,
                content TEXT NOT NULL,
                saved_content TEXT NOT NULL,
                size INTEGER NOT NULL,
                modified_ms INTEGER
            );",
        )
        .map_err(db_error)?;

    if version < SCHEMA_VERSION {
        connection
            .pragma_update(None, "user_version", SCHEMA_VERSION)
            .map_err(db_error)?;
    }

    Ok(())
}

fn save_snapshot(connection: &mut Connection, snapshot: &SessionSnapshot) -> AppResult<()> {
    if snapshot.version != SNAPSHOT_VERSION {
        return Err(AppError::new(
            "invalid_input",
            format!(
                "Refusing to save unsupported session version {}.",
                snapshot.version
            ),
        ));
    }

    let transaction = connection.transaction().map_err(db_error)?;

    transaction
        .execute("DELETE FROM documents", [])
        .map_err(db_error)?;
    transaction
        .execute("DELETE FROM project_roots", [])
        .map_err(db_error)?;
    transaction
        .execute("DELETE FROM project", [])
        .map_err(db_error)?;
    transaction
        .execute("DELETE FROM session", [])
        .map_err(db_error)?;

    transaction
        .execute(
            "INSERT INTO session (id, version, active_document_id) VALUES (1, ?1, ?2)",
            params![SNAPSHOT_VERSION, snapshot.active_document_id.as_deref()],
        )
        .map_err(db_error)?;

    transaction
        .execute(
            "INSERT INTO project (
                id, name, project_path, project_file_path,
                project_file_modified_ms, dirty
            ) VALUES (1, ?1, ?2, ?3, ?4, ?5)",
            params![
                snapshot.project.name,
                snapshot.project.project_path.as_deref(),
                snapshot.project.project_file_path.as_deref(),
                snapshot.project.project_file_modified_ms,
                i64::from(u8::from(snapshot.project.dirty)),
            ],
        )
        .map_err(db_error)?;

    {
        let mut statement = transaction
            .prepare(
                "INSERT INTO project_roots (id, position, path, root_type)
                 VALUES (?1, ?2, ?3, ?4)",
            )
            .map_err(db_error)?;

        for (position, root) in snapshot.project.roots.iter().enumerate() {
            statement
                .execute(params![
                    root.id,
                    position as i64,
                    root.path,
                    root.kind
                ])
                .map_err(db_error)?;
        }
    }

    {
        let mut statement = transaction
            .prepare(
                "INSERT INTO documents (
                    id, position, path, name, kind, content,
                    saved_content, size, modified_ms
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            )
            .map_err(db_error)?;

        for (position, document) in snapshot.documents.iter().enumerate() {
            statement
                .execute(params![
                    document.id,
                    position as i64,
                    document.path.as_deref(),
                    document.name,
                    document.kind,
                    document.content,
                    document.saved_content,
                    document.size,
                    document.modified_ms,
                ])
                .map_err(db_error)?;
        }
    }

    transaction.commit().map_err(db_error)?;

    Ok(())
}

fn load_snapshot(connection: &Connection) -> AppResult<Option<SessionSnapshot>> {
    let session = connection
        .query_row(
            "SELECT version, active_document_id FROM session WHERE id = 1",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, Option<String>>(1)?,
                ))
            },
        )
        .optional()
        .map_err(db_error)?;

    let Some((version, active_document_id)) = session else {
        return Ok(None);
    };

    if version != SNAPSHOT_VERSION {
        return Err(AppError::new(
            "incompatible_session",
            format!("Saved session version {version} is not supported."),
        ));
    }

    let project = connection
        .query_row(
            "SELECT name, project_path, project_file_path,
                    project_file_modified_ms, dirty
             FROM project WHERE id = 1",
            [],
            |row| {
                Ok(SessionProject {
                    name: row.get(0)?,
                    project_path: row.get(1)?,
                    project_file_path: row.get(2)?,
                    project_file_modified_ms: row.get(3)?,
                    dirty: row.get::<_, i64>(4)? != 0,
                    roots: Vec::new(),
                })
            },
        )
        .optional()
        .map_err(db_error)?;

    let Some(mut project) = project else {
        return Ok(None);
    };

    {
        let mut statement = connection
            .prepare(
                "SELECT id, path, root_type FROM project_roots
                 ORDER BY position ASC",
            )
            .map_err(db_error)?;

        let roots = statement
            .query_map([], |row| {
                Ok(SessionRoot {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    kind: row.get(2)?,
                })
            })
            .map_err(db_error)?;

        for root in roots {
            project.roots.push(root.map_err(db_error)?);
        }
    }

    let mut documents = Vec::new();

    {
        let mut statement = connection
            .prepare(
                "SELECT id, path, name, kind, content, saved_content,
                        size, modified_ms
                 FROM documents ORDER BY position ASC",
            )
            .map_err(db_error)?;

        let rows = statement
            .query_map([], |row| {
                Ok(SessionDocument {
                    id: row.get(0)?,
                    path: row.get(1)?,
                    name: row.get(2)?,
                    kind: row.get(3)?,
                    content: row.get(4)?,
                    saved_content: row.get(5)?,
                    size: row.get(6)?,
                    modified_ms: row.get(7)?,
                })
            })
            .map_err(db_error)?;

        for document in rows {
            documents.push(document.map_err(db_error)?);
        }
    }

    Ok(Some(SessionSnapshot {
        version: SNAPSHOT_VERSION,
        active_document_id,
        project,
        documents,
    }))
}

fn db_error(error: rusqlite::Error) -> AppError {
    AppError::internal(format!("Session database error: {error}"))
}

fn backup_path(path: &Path) -> PathBuf {
    let mut value: OsString = path.as_os_str().to_os_string();
    value.push(".bak");
    PathBuf::from(value)
}

fn sidecar_path(path: &Path, suffix: &str) -> PathBuf {
    let mut value: OsString = path.as_os_str().to_os_string();
    value.push(suffix);
    PathBuf::from(value)
}

fn move_to_backup(path: &Path, backup: &Path) -> bool {
    if !path.exists() {
        return false;
    }

    if fs::rename(path, backup).is_err() {
        return false;
    }

    for suffix in ["-wal", "-shm"] {
        let _ = fs::rename(sidecar_path(path, suffix), sidecar_path(backup, suffix));
    }

    true
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_snapshot() -> SessionSnapshot {
        SessionSnapshot {
            version: SNAPSHOT_VERSION,
            active_document_id: Some("doc-2".into()),
            project: SessionProject {
                name: "Notes".into(),
                project_path: Some("/notes".into()),
                project_file_path: Some("/notes/notes.yaml".into()),
                project_file_modified_ms: Some(1_700_000_000_000),
                dirty: true,
                roots: vec![
                    SessionRoot {
                        id: "root-1".into(),
                        path: "/notes".into(),
                        kind: "folder".into(),
                    },
                    SessionRoot {
                        id: "root-2".into(),
                        path: "/notes/todo.md".into(),
                        kind: "file".into(),
                    },
                ],
            },
            documents: vec![
                SessionDocument {
                    id: "doc-1".into(),
                    path: Some("/notes/readme.md".into()),
                    name: "readme.md".into(),
                    kind: "markdown".into(),
                    content: "# Read me\n".into(),
                    saved_content: "# Read me\n".into(),
                    size: 10,
                    modified_ms: Some(1_700_000_000_100),
                },
                SessionDocument {
                    id: "doc-2".into(),
                    path: None,
                    name: "Untitled-1.md".into(),
                    kind: "markdown".into(),
                    content: "draft".into(),
                    saved_content: "".into(),
                    size: 0,
                    modified_ms: None,
                },
            ],
        }
    }

    fn memory_connection() -> Connection {
        let connection = Connection::open_in_memory().expect("open memory db");
        migrate(&connection).expect("migrate");
        connection
    }

    #[test]
    fn round_trips_a_session_snapshot() {
        let mut connection = memory_connection();
        let snapshot = sample_snapshot();

        save_snapshot(&mut connection, &snapshot).expect("save snapshot");
        let loaded = load_snapshot(&connection)
            .expect("load snapshot")
            .expect("snapshot present");

        assert_eq!(loaded.active_document_id.as_deref(), Some("doc-2"));
        assert_eq!(loaded.project.name, "Notes");
        assert!(loaded.project.dirty);
        assert_eq!(loaded.project.roots.len(), 2);
        assert_eq!(loaded.project.roots[1].kind, "file");
        assert_eq!(loaded.documents.len(), 2);
        assert_eq!(loaded.documents[0].content, "# Read me\n");
        assert_eq!(loaded.documents[1].path, None);
        assert_eq!(loaded.documents[1].saved_content, "");
    }

    #[test]
    fn replaces_the_previous_snapshot() {
        let mut connection = memory_connection();
        save_snapshot(&mut connection, &sample_snapshot()).expect("save first");

        let mut next = sample_snapshot();
        next.project.roots.truncate(1);
        next.documents.truncate(1);
        next.active_document_id = Some("doc-1".into());

        save_snapshot(&mut connection, &next).expect("save second");
        let loaded = load_snapshot(&connection)
            .expect("load snapshot")
            .expect("snapshot present");

        assert_eq!(loaded.project.roots.len(), 1);
        assert_eq!(loaded.documents.len(), 1);
        assert_eq!(loaded.active_document_id.as_deref(), Some("doc-1"));
    }

    #[test]
    fn returns_none_without_a_session() {
        let connection = memory_connection();
        assert!(load_snapshot(&connection).expect("load snapshot").is_none());
    }

    #[test]
    fn refuses_a_newer_database_schema() {
        let connection = Connection::open_in_memory().expect("open memory db");
        connection
            .pragma_update(None, "user_version", SCHEMA_VERSION + 1)
            .expect("set user version");

        let error = migrate(&connection).expect_err("must reject newer schema");
        assert_eq!(error.code, "incompatible_session");
    }

    #[test]
    fn migration_is_idempotent() {
        let connection = memory_connection();
        migrate(&connection).expect("migrate again");
    }
}
