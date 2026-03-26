pub mod account_providers;
pub mod aggregation;
pub mod classification;
pub mod commands;
pub mod models;
pub mod normalized;
mod parser;
pub mod sources;
pub mod time_ranges;
mod tray;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            get_projects,
            get_statistics,
            get_sessions,
            get_instructions,
            get_available_providers,
            get_code_changes_detail,
            update_tray_stats,
            detect_sources,
            get_preset_models,
            get_account_usage,
            get_pricing_catalog,
            refresh_pricing_catalog,
        ])
        .setup(|app| {
            tray::setup_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
