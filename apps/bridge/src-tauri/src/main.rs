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

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

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
        if let Err(e) = rt.block_on(daemon::run(loopback_port(), Arc::new(AtomicBool::new(false)))) {
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

    let connected = Arc::new(AtomicBool::new(false));
    let port = loopback_port();

    // Daemon servers run on their own tokio runtime; Tauri owns the main thread.
    {
        let connected = connected.clone();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Runtime::new().expect("daemon runtime");
            if let Err(e) = rt.block_on(daemon::run(port, connected)) {
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

            build_tray(app.handle(), connected.clone(), port)?;
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

fn build_tray(app: &AppHandle, connected: Arc<AtomicBool>, port: u16) -> tauri::Result<()> {
    let status = MenuItem::with_id(app, "status", "Starting…", false, None::<&str>)?;
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
    let sep = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &status,
            &listening,
            &sep,
            &openlogin,
            &reregister,
            &diagnostics,
            &sep,
            &quit,
        ],
    )?;

    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/icon.png"))?;

    TrayIconBuilder::with_id("monocle-bridge")
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

    // Poll the shared flag and refresh the status line on the main thread
    // (AppKit menu mutation must not happen off-thread).
    let handle = app.clone();
    std::thread::spawn(move || loop {
        let on = connected.load(Ordering::SeqCst);
        let item = status.clone();
        let _ = handle.run_on_main_thread(move || {
            let _ = item.set_text(if on {
                "● Browser connected"
            } else {
                "○ No browser connected"
            });
        });
        std::thread::sleep(std::time::Duration::from_secs(2));
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
