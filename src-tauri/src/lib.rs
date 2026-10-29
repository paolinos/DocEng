mod error;
mod fs_ops;
mod path_policy;
mod session;

use fs_ops::{
    authorize_new_file, canonicalize_path, list_directory, read_text_file,
    restore_project_roots, set_project_roots, stat_path, write_text_file,
};
use path_policy::PathPolicy;
use session::{session_load, session_save, SessionDb};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PathPolicy::default())
        .setup(|app| {
            let database = SessionDb::initialize(app.handle());
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            authorize_new_file,
            canonicalize_path,
            list_directory,
            read_text_file,
            restore_project_roots,
            session_load,
            session_save,
            set_project_roots,
            stat_path,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
