//! Native-messaging manifest registration (macOS, per-user). Idempotent; re-run
//! on every daemon launch so newly installed browsers get picked up. PRD §8,
//! docs/native-messaging/native-host.md.

use serde_json::json;
use std::path::PathBuf;

use crate::paths::home;

const HOST_NAME: &str = "com.monocle.bridge";
const FIREFOX_EXT_ID: &str = "ff@monocle.com";

/// Write the manifest to every detected supported browser. `path` is this
/// running binary (`current_exe`) — correct in both `tauri dev` and the bundled
/// app, and it is the same binary the browser re-spawns as the relay.
pub fn register_all() {
    let exe = match std::env::current_exe() {
        Ok(p) => p.to_string_lossy().to_string(),
        Err(e) => {
            eprintln!("[registry] cannot resolve current_exe: {e}");
            return;
        }
    };

    // Firefox: add-on id is stable today.
    write_manifest(
        firefox_dir(),
        json!({
            "name": HOST_NAME,
            "description": "Monocle native messaging bridge",
            "path": exe,
            "type": "stdio",
            "allowed_extensions": [FIREFOX_EXT_ID],
        }),
    );

    // Chrome: allowed_origins embeds the extension id, which is unstable for
    // unpacked dev loads and not yet pinned in wxt.config.ts. Use an override;
    // skip Chrome (not Firefox) when it's absent. PRD §8/§11.
    match chrome_extension_id() {
        Some(ext_id) => write_manifest(
            chrome_dir(),
            json!({
                "name": HOST_NAME,
                "description": "Monocle native messaging bridge",
                "path": exe,
                "type": "stdio",
                "allowed_origins": [format!("chrome-extension://{ext_id}/")],
            }),
        ),
        None => eprintln!(
            "[registry] no Chrome extension id (set MONOCLE_CHROME_EXTENSION_ID \
             or ~/.monocle/bridge-config.json:chromeExtensionId); skipping Chrome"
        ),
    }
}

fn write_manifest(dir: PathBuf, body: serde_json::Value) {
    // Only register for a browser that's actually installed: its app-support
    // parent dir (…/Google/Chrome, …/Mozilla) exists.
    match dir.parent() {
        Some(parent) if parent.exists() => {}
        _ => return,
    }
    if let Err(e) = std::fs::create_dir_all(&dir) {
        eprintln!("[registry] mkdir {} failed: {e}", dir.display());
        return;
    }
    let path = dir.join(format!("{HOST_NAME}.json"));
    match std::fs::write(&path, serde_json::to_vec_pretty(&body).unwrap()) {
        Ok(_) => eprintln!("[registry] wrote {}", path.display()),
        Err(e) => eprintln!("[registry] write {} failed: {e}", path.display()),
    }
}

fn chrome_dir() -> PathBuf {
    home().join("Library/Application Support/Google/Chrome/NativeMessagingHosts")
}

fn firefox_dir() -> PathBuf {
    home().join("Library/Application Support/Mozilla/NativeMessagingHosts")
}

fn chrome_extension_id() -> Option<String> {
    if let Ok(id) = std::env::var("MONOCLE_CHROME_EXTENSION_ID") {
        if !id.is_empty() {
            return Some(id);
        }
    }
    let data = std::fs::read(home().join(".monocle/bridge-config.json")).ok()?;
    let v: serde_json::Value = serde_json::from_slice(&data).ok()?;
    v.get("chromeExtensionId")?.as_str().map(str::to_string)
}
