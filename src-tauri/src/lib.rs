mod error;
mod fs_ops;
mod path_policy;

use fs_ops::{
    authorize_new_file, canonicalize_path, list_directory, read_text_file,
    set_project_roots, stat_path, write_text_file,
};
use path_policy::PathPolicy;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(PathPolicy::default())
        .invoke_handler(tauri::generate_handler![
            authorize_new_file,
            canonicalize_path,
            list_directory,
            read_text_file,
            set_project_roots,
            stat_path,
            write_text_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
