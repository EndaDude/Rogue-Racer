use tauri_plugin_updater::UpdaterExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // On Linux the webview is WebKitGTK, which ships with WebRTC turned
            // OFF by default — that's why online multiplayer (PeerJS/WebRTC)
            // failed there while working on Windows (Chromium WebView2). Turn it
            // on so peer connections work cross-platform. No-op on other OSes.
            #[cfg(target_os = "linux")]
            {
                use tauri::Manager;
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.with_webview(|webview| {
                        use glib::prelude::ObjectExt;
                        use webkit2gtk::WebViewExt;
                        if let Some(settings) = WebViewExt::settings(&webview.inner()) {
                            settings.set_property("enable-webrtc", true);
                            settings.set_property("enable-media-stream", true);
                        }
                    });
                }
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = check_for_update(handle).await {
                    log::error!("updater error: {e}");
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

async fn check_for_update(app: tauri::AppHandle) -> tauri_plugin_updater::Result<()> {
    if let Some(update) = app.updater()?.check().await? {
        update
            .download_and_install(|_downloaded, _total| {}, || {})
            .await?;
        app.restart();
    }
    Ok(())
}
