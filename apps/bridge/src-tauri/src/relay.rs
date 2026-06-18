//! Relay mode: spawned by the browser via `connectNative`. Pure byte pump — the
//! frames on the browser-stdio side and the daemon-UDS side are byte-identical,
//! so the relay never parses or reframes; the daemon does all routing by `id`.
//!
//! If the daemon isn't running, the connect fails and we exit cleanly so the
//! extension's `port.onDisconnect` fires ("Is the Monocle Bridge app running?").

use tokio::net::UnixStream;

use crate::paths;

pub async fn run() {
    let sock = paths::sock_path();
    let stream = match UnixStream::connect(&sock).await {
        Ok(s) => s,
        Err(_) => {
            eprintln!("[relay] no daemon at {} — exiting", sock.display());
            return;
        }
    };

    let (mut uds_rd, mut uds_wr) = stream.into_split();
    let mut stdin = tokio::io::stdin();
    let mut stdout = tokio::io::stdout();

    // Two independent copies. When either side closes its pipe, the matching
    // copy completes; `select!` then drops the other and we exit.
    let browser_to_daemon = async {
        let _ = tokio::io::copy(&mut stdin, &mut uds_wr).await;
    };
    let daemon_to_browser = async {
        let _ = tokio::io::copy(&mut uds_rd, &mut stdout).await;
    };

    tokio::select! {
        _ = browser_to_daemon => {}
        _ = daemon_to_browser => {}
    }
}
