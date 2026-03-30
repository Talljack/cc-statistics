pub mod account_providers;
pub mod aggregation;
pub mod classification;
pub mod commands;
pub mod export;
pub mod models;
pub mod normalized;
mod parser;
pub mod pricing_cache;
pub mod pricing_providers;
pub mod session_reader;
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            get_projects,
            get_statistics,
            get_sessions,
            get_session_messages,
            get_instructions,
            get_available_providers,
            get_code_changes_detail,
            export_report,
            update_tray_stats,
            detect_sources,
            get_preset_models,
            get_account_usage,
            get_pricing_catalog,
            refresh_pricing_catalog,
        ])
        .setup(|app| {
            tray::setup_tray(app)?;
            // Fetch pricing catalog in background so it's ready for cost calculations
            tauri::async_runtime::spawn(async {
                if let Err(e) = pricing_providers::get_catalog(false).await {
                    eprintln!("Background pricing catalog fetch failed: {}", e);
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
