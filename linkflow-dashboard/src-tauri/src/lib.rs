use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[derive(serde::Serialize, serde::Deserialize)]
struct DesktopSession {
  rest_url: String,
  token: String,
}

fn credential() -> Result<keyring::Entry, String> {
  keyring::Entry::new("za.co.controll.linkflow", "desktop-session")
    .map_err(|error| error.to_string())
}

#[tauri::command]
fn save_desktop_session(rest_url: String, token: String) -> Result<(), String> {
  let session = DesktopSession { rest_url, token };
  let encoded = serde_json::to_string(&session).map_err(|error| error.to_string())?;
  credential()?.set_password(&encoded).map_err(|error| error.to_string())
}

#[tauri::command]
fn load_desktop_session() -> Result<Option<DesktopSession>, String> {
  match credential()?.get_password() {
    Ok(value) => serde_json::from_str(&value).map(Some).map_err(|error| error.to_string()),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(error) => Err(error.to_string()),
  }
}

#[tauri::command]
fn clear_desktop_session() -> Result<(), String> {
  match credential()?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(error) => Err(error.to_string()),
  }
}

// A plain `<a download>` click on a `data:` URI — the approach that works in
// a real browser — is unreliable in the Tauri/WebView2 shell: WebView2 does
// not consistently surface a save dialog for programmatic data: downloads.
// Writing the file directly from Rust, after the user picks a path via the
// native dialog plugin, sidesteps that entirely.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
  std::fs::write(path, contents).map_err(|error| error.to_string())
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      use tauri_plugin_deep_link::DeepLinkExt;
      app.deep_link().handle_cli_arguments(argv.into_iter());
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_focus();
      }
    }))
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![save_desktop_session, load_desktop_session, clear_desktop_session, write_text_file])
    .setup(|app| {
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
