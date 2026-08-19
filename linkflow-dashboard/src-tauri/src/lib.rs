use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{
  menu::{Menu, MenuItem, PredefinedMenuItem},
  tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
  Emitter, Manager,
};

/// 1.5s, matching HOLD_TO_STOP_MS in src/lib/time.ts — keep in sync.
const TRAY_HOLD_TO_STOP: Duration = Duration::from_millis(1500);

/// Times a left-click's press-to-release duration on the tray icon, to tell
/// a short click (toggle) apart from a hold (stop). `TrayIconEvent::Click`
/// fires twice per physical click — once for press, once for release — but
/// this crate's `MouseButtonState` naming is inverted from what it reads as
/// (`Up` fires on press, `Down` on release; see its own doc comments), so the
/// two arms below are deliberately spelled out with what they actually mean,
/// not what the variant names suggest.
struct TrayPressState(Mutex<Option<Instant>>);

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

// Holds the one tray icon built at startup so its later commands (visibility,
// tooltip) can reach it. The tray always exists; JS toggles its visibility to
// match the user's "Tray Icon Timer" Settings preference rather than the tray
// being created/destroyed on demand, since Tauri has no simple "remove" for it.
struct TrayHandle(TrayIcon);

#[tauri::command]
fn set_tray_visible(app: tauri::AppHandle, visible: bool) -> Result<(), String> {
  app.state::<TrayHandle>().0.set_visible(visible).map_err(|error| error.to_string())
}

#[tauri::command]
fn set_tray_tooltip(app: tauri::AppHandle, text: String) -> Result<(), String> {
  app.state::<TrayHandle>().0.set_tooltip(Some(text.as_str())).map_err(|error| error.to_string())
}

// "idle"/"paused"/"running" — anything else (a future typo, a version skew
// between JS and Rust) falls back to idle/green rather than panicking, since
// this runs on every phase change.
#[tauri::command]
fn set_tray_phase(app: tauri::AppHandle, phase: String) -> Result<(), String> {
  app.state::<TrayHandle>().0.set_icon(Some(tray_icon_image(phase.as_str()))).map_err(|error| error.to_string())
}

/// Draws the tray icon itself, in code — a solid circle with a white glyph,
/// matching the floating widget's button colors: green + play triangle when
/// idle or paused (click to start/resume), blue + pause bars when running
/// (click to pause). No PNG asset needed: `tauri::image::Image` accepts a
/// raw RGBA buffer directly.
fn tray_icon_image(phase: &str) -> tauri::image::Image<'static> {
  const SIZE: u32 = 32;
  const CENTER: f32 = SIZE as f32 / 2.0;
  const RADIUS: f32 = CENTER - 1.0;

  let running = phase == "running";
  // Same hex values as the floating widget's green/blue button colors.
  let (r, g, b): (u8, u8, u8) = if running { (59, 130, 246) } else { (34, 197, 94) };

  fn edge(px: f32, py: f32, ax: f32, ay: f32, bx: f32, by: f32) -> f32 {
    (px - bx) * (ay - by) - (ax - bx) * (py - by)
  }
  fn in_triangle(px: f32, py: f32, a: (f32, f32), b: (f32, f32), c: (f32, f32)) -> bool {
    let d1 = edge(px, py, a.0, a.1, b.0, b.1);
    let d2 = edge(px, py, b.0, b.1, c.0, c.1);
    let d3 = edge(px, py, c.0, c.1, a.0, a.1);
    let has_neg = d1 < 0.0 || d2 < 0.0 || d3 < 0.0;
    let has_pos = d1 > 0.0 || d2 > 0.0 || d3 > 0.0;
    !(has_neg && has_pos)
  }
  let play_triangle = ((10.0, 7.0), (23.0, 16.0), (10.0, 25.0));
  // Two vertical bars, mirroring PauseIcon in TimerWidget.tsx/TimesheetPanel.tsx.
  let in_pause_bars = |x: u32, y: u32| -> bool {
    ((9..=13).contains(&x) || (18..=22).contains(&x)) && (7..=25).contains(&y)
  };

  let mut buffer = vec![0u8; (SIZE * SIZE * 4) as usize];
  for y in 0..SIZE {
    for x in 0..SIZE {
      let (fx, fy) = (x as f32 + 0.5, y as f32 + 0.5);
      let (dx, dy) = (fx - CENTER, fy - CENTER);
      if dx * dx + dy * dy > RADIUS * RADIUS {
        continue; // Left transparent — outside the circle.
      }

      let glyph_white = if running {
        in_pause_bars(x, y)
      } else {
        in_triangle(fx, fy, play_triangle.0, play_triangle.1, play_triangle.2)
      };

      let idx = ((y * SIZE + x) * 4) as usize;
      if glyph_white {
        buffer[idx..idx + 4].copy_from_slice(&[255, 255, 255, 255]);
      } else {
        buffer[idx..idx + 4].copy_from_slice(&[r, g, b, 255]);
      }
    }
  }
  tauri::image::Image::new_owned(buffer, SIZE, SIZE)
}

pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      use tauri_plugin_deep_link::DeepLinkExt;
      app.deep_link().handle_cli_arguments(argv.into_iter());
      if let Some(window) = app.get_webview_window("main") {
        // The main window is hidden, not destroyed, on close (see the
        // CloseRequested handler in .setup() below) — show() is needed here
        // too, not just set_focus(), or relaunching the app while it's still
        // running in the background (tray/widget visible) would silently do
        // nothing to a window that's still technically open but invisible.
        let _ = window.show();
        let _ = window.set_focus();
      }
    }))
    .plugin(tauri_plugin_opener::init())
    .plugin(tauri_plugin_deep_link::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![
      save_desktop_session,
      load_desktop_session,
      clear_desktop_session,
      write_text_file,
      set_tray_visible,
      set_tray_tooltip,
      set_tray_phase
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Timer tray icon. Hidden by default (`set_visible(false)` below) until
      // JS reports the user's actual "Tray Icon Timer" Settings preference —
      // built once here rather than on demand since Tauri has no simple way
      // to remove a tray icon later, only to hide it.
      let toggle_item = MenuItem::with_id(app, "toggle-timer", "Start / Pause Clock", true, None::<&str>)?;
      // Also reachable by holding the tray icon itself for 1.5s (see
      // on_tray_icon_event below) — kept as a menu item too since a menu
      // click is a guaranteed-reliable fallback regardless of whether the
      // press/release timing on the icon behaves the same on every Windows
      // version.
      let stop_item = MenuItem::with_id(app, "stop-timer", "Stop && Log Session", true, None::<&str>)?;
      let show_item = MenuItem::with_id(app, "show-window", "Show LinkFlow", true, None::<&str>)?;
      let quit_item = PredefinedMenuItem::quit(app, Some("Quit"))?;
      let tray_menu = Menu::with_items(app, &[&toggle_item, &stop_item, &show_item, &quit_item])?;

      let tray_builder = TrayIconBuilder::with_id("timer-tray")
        .icon(tray_icon_image("idle"))
        .menu(&tray_menu)
        // On Windows, attaching a menu makes it pop on left-click too by
        // default — without this, left-click both toggled the clock (below)
        // AND opened the menu on top of it. Right-click still shows the menu.
        .show_menu_on_left_click(false)
        .tooltip("LinkFlow — clocked out")
        .on_menu_event(|app, event| match event.id.as_ref() {
          "toggle-timer" => {
            let _ = app.emit("linkflow://timer-toggle", ());
          }
          "stop-timer" => {
            let _ = app.emit("linkflow://timer-stop", ());
          }
          "show-window" => {
            if let Some(window) = app.get_webview_window("main") {
              let _ = window.show();
              let _ = window.set_focus();
            }
          }
          _ => {}
        })
        // A short left-click toggles the clock (start/resume/pause), matching
        // the floating widget's short press; holding it for 1.5s stops and
        // logs the session instead, matching the widget's hold-to-stop. See
        // TrayPressState's doc comment above for why the match arms below
        // are spelled out by what they mean, not by the variant names.
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click { button: MouseButton::Left, button_state, .. } = event {
            let app = tray.app_handle();
            let press_state = app.state::<TrayPressState>();
            match button_state {
              MouseButtonState::Up => {
                *press_state.0.lock().unwrap() = Some(Instant::now());
              }
              MouseButtonState::Down => {
                if let Some(pressed_at) = press_state.0.lock().unwrap().take() {
                  if pressed_at.elapsed() >= TRAY_HOLD_TO_STOP {
                    let _ = app.emit("linkflow://timer-stop", ());
                  } else {
                    let _ = app.emit("linkflow://timer-toggle", ());
                  }
                }
              }
            }
          }
        });
      // Managed before the tray is built, not after — the tray can start
      // receiving click events the instant build() returns, and the event
      // handler above panics if it reaches for state that isn't managed yet.
      app.manage(TrayPressState(Mutex::new(None)));
      let tray = tray_builder.build(app)?;
      tray.set_visible(false)?;
      app.manage(TrayHandle(tray));

      // Closing the main window (the "X" button) hides it instead of
      // destroying it — "minimize to tray." Destroying it used to also kill
      // the webview that owns every `listen()` call in App.tsx (the timer
      // toggle/stop handlers, the widget/tray state broadcast, etc.), so
      // once closed, the still-visible floating widget and tray icon would
      // silently stop responding to anything — and since the window object
      // itself was gone, relaunching the app (caught by the single-instance
      // plugin above) had nothing left to show or focus. Quitting for real
      // is still available via the tray menu's "Quit" item, which uses
      // Tauri's `PredefinedMenuItem::quit` and isn't affected by this.
      if let Some(main_window) = app.get_webview_window("main") {
        let window_to_hide = main_window.clone();
        main_window.on_window_event(move |event| {
          if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_to_hide.hide();
          }
        });
      }

      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
