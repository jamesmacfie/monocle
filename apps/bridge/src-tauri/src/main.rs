//! Monocle Bridge — one binary, two modes (PRD §3).
//!
//! * **Relay** (browser spawns us via `connectNative`): pump frames stdio⇄UDS,
//!   no GUI. Detected by browser-appended argv before the Tauri runtime starts.
//! * **Daemon** (user/login launch): tray + loopback HTTP + relay UDS listener.

mod daemon;
mod framing;
mod paths;
mod registry;
mod relay;

use std::sync::{Arc, Mutex as StdMutex};

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle,
};
use tauri_plugin_autostart::ManagerExt;

const DEFAULT_LOOPBACK_PORT: u16 = 8765;

/// Caller-facing loopback port. Overridable via `MONOCLE_BRIDGE_PORT` (useful
/// for dev and multi-instance).
fn loopback_port() -> u16 {
    std::env::var("MONOCLE_BRIDGE_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_LOOPBACK_PORT)
}

fn main() {
    if is_relay_invocation() {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("relay runtime");
        rt.block_on(relay::run());
        return;
    }
    // Headless daemon: the servers without the tray/GUI. For tests, CI, and a
    // future headless-Linux host. `MONOCLE_BRIDGE_HEADLESS=1`.
    if std::env::var("MONOCLE_BRIDGE_HEADLESS").as_deref() == Ok("1") {
        registry::register_all();
        let rt = tokio::runtime::Runtime::new().expect("daemon runtime");
        if let Err(e) = rt.block_on(daemon::run(
            loopback_port(),
            Arc::new(StdMutex::new(Vec::new())),
        )) {
            eprintln!("[daemon] fatal: {e}");
        }
        return;
    }
    run_daemon();
}

/// The browser appends its own argv: Chrome a `chrome-extension://…` origin,
/// Firefox the manifest path (ending `com.monocle.bridge.json`) + the add-on id.
/// A normal Finder/login/`tauri dev` launch has none of these. `--relay` is an
/// explicit override for manual testing.
fn is_relay_invocation() -> bool {
    std::env::args().skip(1).any(|a| {
        a == "--relay"
            || a.starts_with("chrome-extension://")
            || a.ends_with("com.monocle.bridge.json")
    })
}

fn run_daemon() {
    // Idempotent manifest registration up front (PRD §5.1).
    registry::register_all();

    // Display names of connected browsers, shared daemon → tray.
    let tray_names = Arc::new(StdMutex::new(Vec::<String>::new()));
    let port = loopback_port();

    // Daemon servers run on their own tokio runtime; Tauri owns the main thread.
    {
        let tray_names = tray_names.clone();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().expect("daemon runtime");
            if let Err(e) = rt.block_on(daemon::run(port, tray_names)) {
                eprintln!("[daemon] fatal: {e}");
            }
        });
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|_app, _argv, _cwd| {}))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(move |app| {
            // Menu-bar only: no Dock icon, no windows.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            build_tray(app.handle(), tray_names.clone(), port)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error building tauri app")
        .run(|_app, event| {
            // Tray-only app: with no windows, the run loop would otherwise exit
            // immediately at startup. Keep it alive; the Quit menu calls
            // `app.exit(0)`, which still terminates.
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                api.prevent_exit();
            }
        });
}

const TRAY_ID: &str = "monocle-bridge";

/// Build the tray menu for the given set of connected browser display names.
/// One status line per browser (or a single "none" line), then the static items.
/// The `on_menu_event` handler lives on the tray icon, not the menu, so it
/// survives a `set_menu` rebuild — only the action-item ids must stay stable.
fn build_menu(
    app: &AppHandle,
    names: &[String],
    port: u16,
) -> tauri::Result<Menu<tauri::Wry>> {
    let sep = PredefinedMenuItem::separator(app)?;
    let listening = MenuItem::with_id(
        app,
        "listening",
        format!("Listening on 127.0.0.1:{port}"),
        false,
        None::<&str>,
    )?;
    let openlogin = CheckMenuItem::with_id(
        app,
        "openlogin",
        "Open at login",
        true,
        app.autolaunch().is_enabled().unwrap_or(false),
        None::<&str>,
    )?;
    let reregister =
        MenuItem::with_id(app, "reregister", "Re-register browsers", true, None::<&str>)?;
    let diagnostics =
        MenuItem::with_id(app, "diagnostics", "Copy diagnostics", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Monocle Bridge", true, None::<&str>)?;

    let menu = Menu::new(app)?;
    if names.is_empty() {
        menu.append(&MenuItem::with_id(
            app,
            "status-none",
            "○ No browser connected",
            false,
            None::<&str>,
        )?)?;
    } else {
        for (i, name) in names.iter().enumerate() {
            menu.append(&MenuItem::with_id(
                app,
                format!("status-{i}"),
                format!("● {name}"),
                false,
                None::<&str>,
            )?)?;
        }
    }
    menu.append_items(&[
        &sep,
        &listening,
        &openlogin,
        &reregister,
        &diagnostics,
        &sep,
        &quit,
    ])?;
    Ok(menu)
}

fn build_tray(
    app: &AppHandle,
    tray_names: Arc<StdMutex<Vec<String>>>,
    port: u16,
) -> tauri::Result<()> {
    let menu = build_menu(app, &[], port)?;
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?;

    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .icon_as_template(true)
        .tooltip("Monocle Bridge")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "quit" => app.exit(0),
            "reregister" => registry::register_all(),
            "openlogin" => {
                let mgr = app.autolaunch();
                let _ = if mgr.is_enabled().unwrap_or(false) {
                    mgr.disable()
                } else {
                    mgr.enable()
                };
            }
            "diagnostics" => copy_diagnostics(app),
            _ => {}
        })
        .build(app)?;

    // Poll the shared names and rebuild the menu on change, on the main thread
    // (AppKit menu mutation must not happen off-thread).
    let handle = app.clone();
    std::thread::spawn(move || {
        let mut last: Vec<String> = Vec::new();
        loop {
            let names = tray_names.lock().map(|g| g.clone()).unwrap_or_default();
            if names != last {
                last = names.clone();
                let h = handle.clone();
                let _ = handle.run_on_main_thread(move || {
                    if let (Ok(menu), Some(tray)) =
                        (build_menu(&h, &names, port), h.tray_by_id(TRAY_ID))
                    {
                        let _ = tray.set_menu(Some(menu));
                    }
                });
            }
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
    });

    Ok(())
}

fn copy_diagnostics(app: &AppHandle) {
    let text = format!(
        "Monocle Bridge {}\nos: {}\nloopback: 127.0.0.1:{}\nsocket: {}",
        app.package_info().version,
        std::env::consts::OS,
        loopback_port(),
        paths::sock_path().display(),
    );
    // ponytail: no secrets here, so a plain stderr dump is enough for M1.
    // Wire a real clipboard write (tauri-plugin-clipboard-manager) if asked.
    eprintln!("[diagnostics]\n{text}");
}
