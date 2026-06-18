//! Daemon mode: owns the caller-facing loopback HTTP server and the relay UDS
//! listener, and routes caller requests to the connected browser by envelope
//! `id`. Holds NO Monocle logic — it injects the bearer token, frames the
//! envelope to the browser, and returns whatever comes back.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use axum::{
    body::{Body, Bytes},
    extract::State,
    http::{header, HeaderMap, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use tokio::net::unix::OwnedWriteHalf;
use tokio::net::{TcpListener, UnixListener, UnixStream};
use tokio::sync::{oneshot, Mutex};
use tokio::time::{timeout, Duration};

use crate::framing::{read_frame, write_frame};
use crate::paths;

/// How long the caller's HTTP request waits for the extension to answer.
const RPC_TIMEOUT: Duration = Duration::from_secs(30);

pub struct DaemonState {
    /// Write half of the currently-connected relay (v1: a single browser).
    relay_tx: Mutex<Option<OwnedWriteHalf>>,
    /// In-flight caller requests, keyed by envelope `id`.
    pending: Mutex<HashMap<String, oneshot::Sender<Vec<u8>>>>,
    /// Shared with the tray so it can show live connection state.
    connected: Arc<AtomicBool>,
    port: u16,
}

impl DaemonState {
    fn new(connected: Arc<AtomicBool>, port: u16) -> Self {
        Self {
            relay_tx: Mutex::new(None),
            pending: Mutex::new(HashMap::new()),
            connected,
            port,
        }
    }

    /// Route a frame received from the browser to its waiting caller by `id`.
    /// Returns true if it matched a pending request.
    async fn deliver(&self, body: Vec<u8>) -> bool {
        let Ok(val) = serde_json::from_slice::<Value>(&body) else {
            return false;
        };
        let Some(id) = val.get("id").and_then(|v| v.as_str()) else {
            return false;
        };
        if let Some(tx) = self.pending.lock().await.remove(id) {
            return tx.send(body).is_ok();
        }
        false
    }
}

pub async fn run(port: u16, connected: Arc<AtomicBool>) -> std::io::Result<()> {
    let state = Arc::new(DaemonState::new(connected, port));

    std::fs::create_dir_all(paths::monocle_dir())?;

    // --- UDS listener (relay connections) ---
    let sock = paths::sock_path();
    let _ = std::fs::remove_file(&sock); // clear a stale socket from a crash
    let uds = UnixListener::bind(&sock)?;
    {
        let state = state.clone();
        tokio::spawn(async move {
            loop {
                match uds.accept().await {
                    Ok((stream, _)) => accept_relay(state.clone(), stream),
                    Err(e) => eprintln!("[daemon] uds accept error: {e}"),
                }
            }
        });
    }

    write_discovery(port, &sock);

    // --- loopback HTTP (caller-facing) ---
    let app = Router::new()
        .route("/", post(handle_rpc))
        .route("/status", get(handle_status))
        .with_state(state);
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port)); // 127.0.0.1 ONLY
    let listener = TcpListener::bind(addr).await?;
    eprintln!("[daemon] listening on http://{addr}");
    axum::serve(listener, app).await
}

/// Take ownership of a new relay connection: store its write half and pump
/// responses off its read half into the pending map.
fn accept_relay(state: Arc<DaemonState>, stream: UnixStream) {
    let (mut rd, wr) = stream.into_split();
    let st = state.clone();
    tokio::spawn(async move {
        *st.relay_tx.lock().await = Some(wr);
        st.connected.store(true, Ordering::SeqCst);
        loop {
            match read_frame(&mut rd).await {
                Ok(Some(body)) => {
                    st.deliver(body).await;
                }
                Ok(None) | Err(_) => break, // relay/browser gone
            }
        }
        st.connected.store(false, Ordering::SeqCst);
        *st.relay_tx.lock().await = None;
    });
}

async fn handle_rpc(
    State(state): State<Arc<DaemonState>>,
    headers: HeaderMap,
    body: Bytes,
) -> Response {
    // Block web pages from driving the bridge via loopback fetch.
    if headers.contains_key(header::ORIGIN) {
        return (StatusCode::FORBIDDEN, "origin not allowed").into_response();
    }

    let mut env: Value = match serde_json::from_slice(&body) {
        Ok(v) => v,
        Err(_) => return (StatusCode::BAD_REQUEST, "invalid json").into_response(),
    };
    let Some(id) = env.get("id").and_then(|v| v.as_str()).map(str::to_string) else {
        return (StatusCode::BAD_REQUEST, "missing id").into_response();
    };

    // Inject the bearer token into the envelope (the extension validates it).
    if let Some(token) = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
    {
        env["auth"] = json!({ "token": token });
    }

    let payload = serde_json::to_vec(&env).expect("re-serialize envelope");
    let (tx, rx) = oneshot::channel();

    {
        let mut guard = state.relay_tx.lock().await;
        let Some(wr) = guard.as_mut() else {
            return error_envelope(&id, "not_enabled", "no browser connected");
        };
        state.pending.lock().await.insert(id.clone(), tx);
        if write_frame(wr, &payload).await.is_err() {
            state.pending.lock().await.remove(&id);
            return error_envelope(&id, "internal", "relay write failed");
        }
    }

    match timeout(RPC_TIMEOUT, rx).await {
        Ok(Ok(resp)) => Response::builder()
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(resp))
            .unwrap(),
        _ => {
            state.pending.lock().await.remove(&id);
            error_envelope(&id, "internal", "no response from extension")
        }
    }
}

async fn handle_status(State(state): State<Arc<DaemonState>>) -> Json<Value> {
    Json(json!({
        "ok": true,
        "bridge": "monocle",
        "connected": state.connected.load(Ordering::SeqCst),
        "loopbackPort": state.port,
        "portOwner": true,
    }))
}

/// A protocol-shaped error envelope so the caller can branch on `error.code`
/// even when no browser is connected.
fn error_envelope(id: &str, code: &str, message: &str) -> Response {
    Json(json!({
        "v": 1,
        "id": id,
        "ok": false,
        "error": { "code": code, "message": message },
    }))
    .into_response()
}

fn write_discovery(port: u16, sock: &std::path::Path) {
    let body = json!({
        "version": 1,
        "loopbackPort": port,
        "ipcPath": sock.to_string_lossy(),
        "pid": std::process::id(),
    });
    if let Err(e) = std::fs::write(
        paths::discovery_path(),
        serde_json::to_vec_pretty(&body).unwrap(),
    ) {
        eprintln!("[daemon] failed to write discovery file: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn deliver_routes_response_by_id() {
        let state = DaemonState::new(Arc::new(AtomicBool::new(false)), 8765);
        let (tx, rx) = oneshot::channel();
        state.pending.lock().await.insert("req-1".into(), tx);

        let body = br#"{"v":1,"id":"req-1","ok":true,"result":{}}"#.to_vec();
        assert!(state.deliver(body.clone()).await);
        assert_eq!(rx.await.unwrap(), body);
    }

    #[tokio::test]
    async fn deliver_ignores_unknown_id() {
        let state = DaemonState::new(Arc::new(AtomicBool::new(false)), 8765);
        let body = br#"{"v":1,"id":"nobody-waiting","ok":true}"#.to_vec();
        assert!(!state.deliver(body).await);
    }
}
