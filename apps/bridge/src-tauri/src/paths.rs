//! Well-known paths (macOS, per-user). PRD §9.

use std::path::PathBuf;

pub fn home() -> PathBuf {
    PathBuf::from(std::env::var("HOME").expect("HOME not set"))
}

/// `~/.monocle` — holds the IPC socket and the discovery file.
pub fn monocle_dir() -> PathBuf {
    home().join(".monocle")
}

/// Unix-domain socket the relay connects to (relay⇄daemon IPC).
pub fn sock_path() -> PathBuf {
    monocle_dir().join("bridge.sock")
}

/// Discovery file `{version, loopbackPort, ipcPath, pid}` so a relay can find
/// the daemon.
pub fn discovery_path() -> PathBuf {
    monocle_dir().join("bridge.json")
}
