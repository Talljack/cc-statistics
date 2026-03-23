use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{MenuBuilder, MenuItem},
    tray::TrayIconBuilder,
    App, AppHandle, Manager, Wry,
};

use crate::commands::{get_statistics_internal, TrayDisplayStats};

pub struct TrayState {
    pub cost_item: MenuItem<Wry>,
    pub sessions_item: MenuItem<Wry>,
    pub tokens_item: MenuItem<Wry>,
}

pub fn setup_tray(app: &App) -> Result<(), Box<dyn std::error::Error>> {
    let cost_item = MenuItem::with_id(app, "cost", "Today: $0.00", false, None::<&str>)?;
    let sessions_item = MenuItem::with_id(
        app,
        "sessions",
        "Sessions: 0  ·  0 instructions",
        false,
        None::<&str>,
    )?;
    let tokens_item = MenuItem::with_id(app, "tokens", "Tokens: 0", false, None::<&str>)?;
    let open_item = MenuItem::with_id(app, "open", "Open Dashboard", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = MenuBuilder::new(app)
        .item(&cost_item)
        .item(&sessions_item)
        .item(&tokens_item)
        .separator()
        .item(&open_item)
        .separator()
        .item(&quit_item)
        .build()?;

    let mut builder = TrayIconBuilder::with_id("main")
        .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
        .tooltip("CC Statistics")
        .menu(&menu);

    // icon_as_template and show_menu_on_left_click are macOS-specific behaviors
    #[cfg(target_os = "macos")]
    {
        builder = builder.icon_as_template(true).show_menu_on_left_click(true);
    }

    builder
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    app.manage(Mutex::new(TrayState {
        cost_item,
        sessions_item,
        tokens_item,
    }));

    Ok(())
}

pub fn update_tray(app: &AppHandle, override_stats: Option<TrayDisplayStats>) {
    let stats = match override_stats {
        Some(stats) => stats,
        None => {
            let fallback_stats = match get_statistics_internal(
                None,
                "today".to_string(),
                None,
                None,
                &[],
                &Default::default(),
            ) {
                Ok(stats) => stats,
                Err(_) => return,
            };

            TrayDisplayStats {
                cost_usd: fallback_stats.cost_usd,
                sessions: fallback_stats.sessions as usize,
                instructions: fallback_stats.instructions as u64,
                total_tokens: fallback_stats.tokens.input
                    + fallback_stats.tokens.output
                    + fallback_stats.tokens.cache_read
                    + fallback_stats.tokens.cache_creation,
            }
        }
    };

    let state = match app.try_state::<Mutex<TrayState>>() {
        Some(s) => s,
        None => return,
    };

    let tray = match state.lock() {
        Ok(t) => t,
        Err(_) => return,
    };

    let cost_text = if stats.cost_usd >= 1.0 {
        format!("Today: ${:.2}", stats.cost_usd)
    } else if stats.cost_usd > 0.0 {
        format!("Today: ${:.3}", stats.cost_usd)
    } else {
        "Today: $0.00".to_string()
    };

    let tokens_text = if stats.total_tokens >= 1_000_000 {
        format!("Tokens: {:.1}M", stats.total_tokens as f64 / 1_000_000.0)
    } else if stats.total_tokens >= 1_000 {
        format!("Tokens: {:.1}K", stats.total_tokens as f64 / 1_000.0)
    } else {
        format!("Tokens: {}", stats.total_tokens)
    };

    let sessions_text = format!(
        "Sessions: {}  ·  {} instructions",
        stats.sessions, stats.instructions
    );

    let _ = tray.cost_item.set_text(cost_text);
    let _ = tray.sessions_item.set_text(sessions_text);
    let _ = tray.tokens_item.set_text(tokens_text);
}
