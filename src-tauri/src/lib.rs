mod commands;
mod models;
mod parser;

use commands::*;
use std::sync::Mutex;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState {
            cache: Mutex::new(CacheData::default()),
        })
        .invoke_handler(tauri::generate_handler![
            get_projects,
            get_statistics,
            get_cache_status,
            refresh_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
