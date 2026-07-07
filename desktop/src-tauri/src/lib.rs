use tauri_plugin_updater::UpdaterExt;

// Recursively copy a directory tree (used to migrate old profile data).
#[cfg(target_os = "windows")]
fn copy_dir_all(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_all(&entry.path(), &to)?;
        } else if ty.is_file() {
            let _ = std::fs::copy(entry.path(), &to);
        }
    }
    Ok(())
}

// Copy any missing/changed files from `src` into `dst` (used to keep the external
// Audio folder in sync with the audio bundled in this build, without clobbering
// files the player added). Skips files whose size already matches.
fn mirror_dir(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    if !src.is_dir() {
        return Ok(());
    }
    std::fs::create_dir_all(dst)?;
    for entry in std::fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let to = dst.join(entry.file_name());
        if ty.is_dir() {
            mirror_dir(&entry.path(), &to)?;
        } else if ty.is_file() {
            let need = match (std::fs::metadata(entry.path()), std::fs::metadata(&to)) {
                (Ok(a), Ok(b)) => a.len() != b.len(),
                _ => true,
            };
            if need {
                let _ = std::fs::copy(entry.path(), &to);
            }
        }
    }
    Ok(())
}

// Consolidate every bit of app data into one folder: %LOCALAPPDATA%\Rogue Racer.
// Old builds split data across "com.rogueracer.game" in both Roaming and Local
// (WebView localStorage = customizations/PeerJS ids, plus Maps and the game
// cache). This migrates all of it into "Rogue Racer", points WebView2 at the new
// folder so localStorage survives, ensures the external Audio folder exists, then
// deletes the old folders so no traces are left behind. Must run before the
// webview is created (WEBVIEW2_USER_DATA_FOLDER is read at webview startup).
#[cfg(target_os = "windows")]
fn consolidate_storage() {
    use std::path::PathBuf;
    let local = match std::env::var_os("LOCALAPPDATA") {
        Some(p) => PathBuf::from(p),
        None => return,
    };
    let roaming = std::env::var_os("APPDATA").map(PathBuf::from);
    let new_dir = local.join("Rogue Racer");
    let _ = std::fs::create_dir_all(&new_dir);

    // Always redirect WebView2's profile here (env vars don't persist between runs),
    // so localStorage/IndexedDB (settings, PeerJS ids, ghosts) live under "Rogue Racer".
    std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", &new_dir);
    let _ = std::fs::create_dir_all(new_dir.join("Audio"));

    // The copy/delete migration only needs to happen once.
    let marker = new_dir.join(".consolidated");
    if marker.exists() {
        return;
    }

    let old_local = local.join("com.rogueracer.game");
    let mut local_ready = !old_local.exists();
    // WebView profile -> Rogue Racer\EBWebView (keeps customizations / PeerJS data).
    let old_webview = old_local.join("EBWebView");
    let new_webview = new_dir.join("EBWebView");
    if old_webview.is_dir() {
        if new_webview.exists() || copy_dir_all(&old_webview, &new_webview).is_ok() {
            local_ready = true;
        }
    }

    // Maps + game cache from the old Roaming folder.
    let mut roaming_ready = true;
    if let Some(roaming) = roaming.as_ref() {
        let old_roaming = roaming.join("com.rogueracer.game");
        if old_roaming.exists() {
            let mut ok = true;
            let old_maps = old_roaming.join("Maps");
            let new_maps = new_dir.join("Maps");
            if old_maps.is_dir() && !new_maps.exists() && copy_dir_all(&old_maps, &new_maps).is_err() {
                ok = false;
            }
            for f in ["game-cache.html", ".window-state.json"] {
                let s = old_roaming.join(f);
                let d = new_dir.join(f);
                if s.is_file() && !d.exists() && std::fs::copy(&s, &d).is_err() {
                    ok = false;
                }
            }
            roaming_ready = ok;
        }
    }

    // Leave no traces: delete the old split folders once safely copied.
    if local_ready {
        let _ = std::fs::remove_dir_all(&old_local);
    }
    if roaming_ready {
        if let Some(roaming) = roaming.as_ref() {
            let _ = std::fs::remove_dir_all(roaming.join("com.rogueracer.game"));
        }
    }

    if local_ready && roaming_ready {
        let _ = std::fs::write(&marker, b"1");
    }
}

#[cfg(not(target_os = "windows"))]
fn consolidate_storage() {}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Migrate/redirect all storage into %LOCALAPPDATA%\Rogue Racer before the
    // webview starts (must precede Builder so WebView2 picks up the new profile).
    consolidate_storage();
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
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
            // Make sure the external Audio folder (%LOCALAPPDATA%\Rogue Racer\Audio)
            // is populated / updated from the audio bundled with this build. The game
            // loads all sounds from there instead of from inside the executable.
            {
                use tauri::Manager;
                if let (Ok(res), Some(local)) =
                    (app.path().resource_dir(), std::env::var_os("LOCALAPPDATA"))
                {
                    let src = res.join("Audio");
                    let dst = std::path::Path::new(&local).join("Rogue Racer").join("Audio");
                    let _ = mirror_dir(&src, &dst);
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
