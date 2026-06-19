//! Daemon mode: owns the caller-facing loopback HTTP server and the relay UDS
//! listener, and routes caller requests to a connected browser by envelope `id`.
//! Holds NO Monocle logic — it injects the bearer token, frames the envelope to
//! the browser, and returns whatever comes back.
//!
//! Multi-browser: more than one browser can connect at once (each spawns its own
//! relay). On connect the daemon learns the browser's identity via the existing
//! unauthenticated `meta/info` and registers the relay under that id ("chrome",
//! "firefox", …). Callers list connected browsers via `GET /instances` and target
//! one with the `X-Monocle-Target` header; with a single browser the header is
//! optional.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex as StdMutex};

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

/// How long the connect-time `meta/info` handshake waits before the relay is
/// registered under a fallback id instead of its real browser name.
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(5);

/// Caller header naming the browser to route to. MUST match
/// `MONOCLE_TARGET_HEADER` in packages/native-bridge-protocol.
const TARGET_HEADER: &str = "X-Monocle-Target";

/// One connected browser's relay: its write half plus the identity learned at
/// the connect-time handshake. `nonce` is unique per connection so a relay's
/// read loop only evicts its own entry on disconnect (a newer same-name relay
/// may have replaced it).
struct RelayEntry {
    nonce: u64,
    name: String,
    channel: String,
    version: String,
    tx: OwnedWriteHalf,
}

pub struct DaemonState {
    /// Connected relays keyed by browser id ("chrome"/"firefox"). A reconnecting
    /// browser replaces its own entry (last relay wins for a given id).
    relays: Mutex<HashMap<String, RelayEntry>>,
    /// In-flight caller (and handshake) requests, keyed by envelope `id`.
    pending: Mutex<HashMap<String, oneshot::Sender<Vec<u8>>>>,
    /// Display names of connected browsers, mirrored for the tray (read off the
    /// main thread, so a std Mutex rather than the async one).
    tray_names: Arc<StdMutex<Vec<String>>>,
    next_nonce: AtomicU64,
    port: u16,
}

impl DaemonState {
    fn new(tray_names: Arc<StdMutex<Vec<String>>>, port: u16) -> Self {
        Self {
            relays: Mutex::new(HashMap::new()),
            pending: Mutex::new(HashMap::new()),
            tray_names,
            next_nonce: AtomicU64::new(1),
            port,
        }
    }

    /// Route a frame received from a browser to its waiting caller by `id`.
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

    async fn insert_relay(&self, id: String, entry: RelayEntry) {
        self.relays.lock().await.insert(id, entry);
        self.refresh_tray().await;
    }

    async fn remove_relay_by_nonce(&self, nonce: u64) {
        self.relays.lock().await.retain(|_, e| e.nonce != nonce);
        self.refresh_tray().await;
    }

    async fn refresh_tray(&self) {
        let names: Vec<String> = self
            .relays
            .lock()
            .await
            .values()
            .map(|e| e.name.clone())
            .collect();
        if let Ok(mut guard) = self.tray_names.lock() {
            *guard = names;
        }
    }
}

/// Pick which connected relay a request routes to. Pure so it can be tested
/// without real sockets.
fn select_relay(
    target: Option<&str>,
    ids: &[String],
) -> Result<String, (&'static str, &'static str)> {
    match target {
        Some(t) => {
            if ids.iter().any(|i| i == t) {
                Ok(t.to_string())
            } else {
                Err(("not_enabled", "selected browser not connected"))
            }
        }
        None => match ids.len() {
            0 => Err(("not_enabled", "no browser connected")),
            1 => Ok(ids[0].clone()),
            _ => Err((
                "bad_request",
                "multiple browsers connected; specify a target browser",
            )),
        },
    }
}

pub async fn run(port: u16, tray_names: Arc<StdMutex<Vec<String>>>) -> std::io::Result<()> {
    let state = Arc::new(DaemonState::new(tray_names, port));

    std::fs::create_dir_all(paths::monocle_dir())?;

    // --- UDS listener (relay connections) ---
    let sock = paths::sock_path();
    // Guard against clobbering a live daemon: if something is already serving the
    // socket, another instance owns it (e.g. a racing relaunch that reached here
    // before single-instance exited it). Don't unlink/rebind under the running
    // daemon — bail and let the existing one keep the connection.
    if UnixStream::connect(&sock).await.is_ok() {
        eprintln!(
            "[daemon] another daemon already owns {} — not starting servers",
            sock.display()
        );
        return Ok(());
    }
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
        .route("/instances", get(handle_instances))
        .with_state(state);
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port)); // 127.0.0.1 ONLY
    let listener = TcpListener::bind(addr).await?;
    eprintln!("[daemon] listening on http://{addr}");
    axum::serve(listener, app).await
}

/// Take ownership of a new relay connection: pump its responses off the read
/// half into the pending map, and (in parallel) handshake to learn which browser
/// it is before registering its write half for routing.
fn accept_relay(state: Arc<DaemonState>, stream: UnixStream) {
    let (mut rd, wr) = stream.into_split();
    let nonce = state.next_nonce.fetch_add(1, Ordering::SeqCst);

    // Read loop: delivers ALL frames — caller responses AND the handshake reply.
    {
        let st = state.clone();
        tokio::spawn(async move {
            loop {
                match read_frame(&mut rd).await {
                    Ok(Some(body)) => {
                        st.deliver(body).await;
                    }
                    Ok(None) | Err(_) => break, // relay/browser gone
                }
            }
            // Evict only our own entry — a newer same-name relay may own the slot.
            st.remove_relay_by_nonce(nonce).await;
        });
    }

    // Handshake: identify the browser, then register it for routing.
    tokio::spawn(async move {
        let mut wr = wr;
        let (id, name, channel, version) = match handshake(&state, nonce, &mut wr).await {
            Some(m) => m,
            None => {
                // Couldn't identify it; still make it routable as a lone browser
                // so single-browser setups keep working if meta/info ever changes.
                (
                    format!("browser-{nonce}"),
                    "Browser".to_string(),
                    String::new(),
                    String::new(),
                )
            }
        };
        state
            .insert_relay(
                id,
                RelayEntry {
                    nonce,
                    name,
                    channel,
                    version,
                    tx: wr,
                },
            )
            .await;
    });
}

/// Send the unauthenticated `meta/info` down the relay and parse the browser
/// identity. Returns (routing id, display name, channel, version).
async fn handshake(
    state: &DaemonState,
    nonce: u64,
    wr: &mut OwnedWriteHalf,
) -> Option<(String, String, String, String)> {
    let req_id = format!("__meta__{nonce}");
    let (tx, rx) = oneshot::channel();
    state.pending.lock().await.insert(req_id.clone(), tx);

    let env = json!({ "v": 1, "id": req_id, "method": "meta/info", "params": {} });
    let payload = serde_json::to_vec(&env).ok()?;
    if write_frame(wr, &payload).await.is_err() {
        state.pending.lock().await.remove(&req_id);
        return None;
    }

    let body = match timeout(HANDSHAKE_TIMEOUT, rx).await {
        Ok(Ok(b)) => b,
        _ => {
            state.pending.lock().await.remove(&req_id);
            return None;
        }
    };

    let val: Value = serde_json::from_slice(&body).ok()?;
    let browser = val.get("result")?.get("browser")?;
    let raw_name = browser.get("name")?.as_str()?;
    let channel = browser
        .get("channel")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let version = browser
        .get("extensionVersion")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Some((raw_name.to_lowercase(), display_name(raw_name), channel, version))
}

fn display_name(raw: &str) -> String {
    let mut chars = raw.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
        None => raw.to_string(),
    }
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

    let target = headers
        .get(TARGET_HEADER)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);

    let payload = serde_json::to_vec(&env).expect("re-serialize envelope");
    let (tx, rx) = oneshot::channel();

    {
        let mut relays = state.relays.lock().await;
        let ids: Vec<String> = relays.keys().cloned().collect();
        let key = match select_relay(target.as_deref(), &ids) {
            Ok(k) => k,
            Err((code, msg)) => return error_envelope(&id, code, msg),
        };
        let entry = relays.get_mut(&key).expect("selected id present");
        state.pending.lock().await.insert(id.clone(), tx);
        if write_frame(&mut entry.tx, &payload).await.is_err() {
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
    let connected = !state.relays.lock().await.is_empty();
    Json(json!({
        "ok": true,
        "bridge": "monocle",
        "connected": connected,
        "loopbackPort": state.port,
        "portOwner": true,
    }))
}

/// Daemon-local: the currently connected browsers, for the caller's picker. No
/// browser round-trip — identities are cached at the connect handshake.
async fn handle_instances(State(state): State<Arc<DaemonState>>) -> Json<Value> {
    let relays = state.relays.lock().await;
    let instances: Vec<Value> = relays
        .iter()
        .map(|(id, e)| {
            json!({
                "id": id,
                "name": e.name,
                "channel": e.channel,
                "extensionVersion": e.version,
            })
        })
        .collect();
    Json(json!({ "instances": instances }))
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

    fn ids(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[tokio::test]
    async fn deliver_routes_response_by_id() {
        let state = DaemonState::new(Arc::new(StdMutex::new(Vec::new())), 8765);
        let (tx, rx) = oneshot::channel();
        state.pending.lock().await.insert("req-1".into(), tx);

        let body = br#"{"v":1,"id":"req-1","ok":true,"result":{}}"#.to_vec();
        assert!(state.deliver(body.clone()).await);
        assert_eq!(rx.await.unwrap(), body);
    }

    #[tokio::test]
    async fn deliver_ignores_unknown_id() {
        let state = DaemonState::new(Arc::new(StdMutex::new(Vec::new())), 8765);
        let body = br#"{"v":1,"id":"nobody-waiting","ok":true}"#.to_vec();
        assert!(!state.deliver(body).await);
    }

    #[test]
    fn select_relay_targets_named_browser() {
        let connected = ids(&["chrome", "firefox"]);
        assert_eq!(select_relay(Some("firefox"), &connected).unwrap(), "firefox");
    }

    #[test]
    fn select_relay_rejects_unconnected_target() {
        let connected = ids(&["chrome"]);
        assert_eq!(
            select_relay(Some("firefox"), &connected).unwrap_err().0,
            "not_enabled"
        );
    }

    #[test]
    fn select_relay_defaults_to_sole_browser() {
        let connected = ids(&["chrome"]);
        assert_eq!(select_relay(None, &connected).unwrap(), "chrome");
    }

    #[test]
    fn select_relay_requires_target_when_ambiguous() {
        let connected = ids(&["chrome", "firefox"]);
        assert_eq!(
            select_relay(None, &connected).unwrap_err().0,
            "bad_request"
        );
    }

    #[test]
    fn select_relay_none_connected() {
        assert_eq!(select_relay(None, &[]).unwrap_err().0, "not_enabled");
    }

    #[test]
    fn display_name_capitalizes() {
        assert_eq!(display_name("chrome"), "Chrome");
        assert_eq!(display_name("firefox"), "Firefox");
        assert_eq!(display_name(""), "");
    }
}
