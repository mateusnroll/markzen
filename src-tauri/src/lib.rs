use tauri::Manager;
use tauri_plugin_decorum::WebviewWindowExt;

#[tauri::command]
fn setup_window_decorum(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(not(target_os = "macos"))]
    window
        .create_overlay_titlebar()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "macos")]
    window
        .set_traffic_lights_inset(16.0, 12.0)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reposition_traffic_lights(window: tauri::WebviewWindow) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        // Nudge the window size by 1px and back to trigger the delegate's
        // windowDidResize, which repositions traffic lights correctly.
        let size = window.outer_size().map_err(|e| e.to_string())?;
        window
            .set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: size.width + 1,
                height: size.height,
            }))
            .map_err(|e| e.to_string())?;
        window
            .set_size(tauri::Size::Physical(size))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_decorum::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![setup_window_decorum, reposition_traffic_lights])
        .setup(|app| {
            let main_window = app.get_webview_window("main").unwrap();
            #[cfg(not(target_os = "macos"))]
            main_window.create_overlay_titlebar().unwrap();
            #[cfg(target_os = "macos")]
            main_window.set_traffic_lights_inset(16.0, 12.0).unwrap();

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
