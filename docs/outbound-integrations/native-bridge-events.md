# Deferred Native-Bridge Event Transport

> **Status: proposed and deferred.** Do not begin this phase until inline
> Automation actions and outbound HTTP are implemented, browser-tested, and
> accepted as stable contracts.

## Why this is not the first transport

Native messaging is already an optional, review-sensitive Monocle integration,
but the current Bridge is shaped for **external app asks, extension replies**.
It does not expose a live client subscription or route an unsolicited extension
frame.

At `b43f2ac`:

- bridge scopes are only `suggestions:read` and `commands:execute`;
- `port.ts` treats every native message as a request and posts one response;
- the daemon stores pending caller requests by envelope id; and
- a browser frame whose id is not pending is dropped.

Chrome's native messaging API supports extension-to-host `port.postMessage`,
but product-level event delivery still needs routing, authentication,
backpressure, and client lifetime semantics:
[Chrome native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging).

Direct HTTP therefore has much lower implementation and distribution cost for
the first IDE use case. Native events remain valuable later for already-paired
desktop clients and for installations that prefer one managed local transport.

## Public Automation step

Phase 4 adds a separate engine operation:

```ts
type SendBridgeEventStep = EngineStepBase & {
  op: "sendBridgeEvent"
  clientInstanceId: string
  eventName: string
  payload: JsonValue
  timeoutMs?: number
}
```

- `clientInstanceId` is the stable paired-client id, never the display name.
- `eventName` is static, 1–100 characters, and matches
  `/^[A-Za-z][A-Za-z0-9._-]*$/`.
- String leaves in `payload` interpolate using the same helper and 64 KiB
  serialized cap as `httpRequest`.
- Client, event name, object keys, and shape are not interpolated.
- Timeout defaults to 5 seconds and is capped at 15 seconds.
- The step targets exactly one client. Broadcast is not supported.
- Success means “queued to a live authenticated subscriber,” not “the client
  completed the requested work.”

The step is available at top level and inside inline action bodies. Import
summaries list the client instance id and event name, never payload values.

## Pairing and scopes

Add `events:receive` to the public `BridgeScope` union. Do **not** append that
scope silently to existing hashes/tokens.

Revise pairing so a client requests a subset of known scopes and the
Integrations page displays them before approval. For this phase:

- existing tokens retain their existing scopes;
- a client must re-pair or complete an explicit scope-upgrade approval to get
  `events:receive`;
- the paired-client row displays “Receives Automation events”;
- revoke still invalidates every scope on that token; and
- no global “send to all paired apps” toggle is added.

The extension remains the token/scope authority. The daemon sees bearer tokens
only long enough to forward authorization to the connected extension and does
not persist token material.

## Client subscription endpoint

Add authenticated server-sent events to the loopback daemon:

```http
GET /events HTTP/1.1
Authorization: Bearer <paired-client-token>
X-Monocle-Target: chrome
Accept: text/event-stream
```

Rules:

- bind on the existing `127.0.0.1` daemon listener only;
- reject every request carrying a browser `Origin` header;
- select a browser using the existing target-header rules;
- synthesize `events/authorize-subscription` to that extension, passing the
  token through the existing auth envelope;
- require `events:receive` and return the authenticated `clientInstanceId`;
- keep one subscription per `(relay nonce, clientInstanceId)`; a newer
  subscription replaces the previous connection; and
- send keepalive comments without creating Monocle events.

The authorization method is transport-internal but belongs in the shared
validated protocol so extension and clients cannot accidentally reuse an
unvalidated shape:

```ts
type AuthorizeEventSubscriptionResult = {
  clientInstanceId: string
}
```

The SSE data frame is stable public data:

```jsonc
{
  "v": 1,
  "eventId": "uuid",
  "eventName": "github.openRepository",
  "payload": { "url": "https://github.com/example/project" },
  "createdAt": 1783650000000,
  "browser": { "name": "chrome", "channel": "stable" }
}
```

Do not include tab title/URL automatically. Those values appear only when the
Automation author puts them in `payload`.

## Extension-originated native frame

Generalize `background/features/nativeMessaging/port.ts` into a bidirectional
multiplexer:

- native **requests** still route to `handleBridgeRequest` and receive a reply;
- native **responses** resolve a pending extension-originated request by id;
- unknown/malformed frames are rejected without being interpreted as requests;
- disconnect rejects every pending publication and clears timers; and
- reconnect retains no event queue.

Publish frame:

```jsonc
{
  "v": 1,
  "id": "uuid",
  "type": "event/publish",
  "clientInstanceId": "ide-instance-uuid",
  "event": {
    "name": "github.openRepository",
    "payload": { "url": "https://github.com/example/project" },
    "createdAt": 1783650000000
  }
}
```

Daemon acknowledgement uses the existing correlated response envelope. It is
successful only after the event enters the selected subscriber's bounded
channel.

## Daemon routing and delivery semantics

Extend `DaemonState` with subscriptions keyed by relay nonce and client id.
When the UDS read loop receives a browser frame:

1. deliver ordinary response envelopes to the existing pending map;
2. otherwise validate `event/publish` strictly;
3. find a subscriber belonging to the same relay nonce and client id;
4. try to enqueue the SSE frame; and
5. write a success/failure acknowledgement back to that relay.

Use a bounded channel of 32 events. If it is full, fail the publish with
`rate_limited`; do not drop the oldest/newest event silently. If no subscriber
exists, return `not_found`. On relay or SSE disconnect, remove its entries.

Delivery is **at-most-once**:

- no disk persistence;
- no service-worker queue;
- no replay from `Last-Event-ID`;
- no resend after an ambiguous disconnect; and
- no client-processing acknowledgement.

Those semantics make a button retry an explicit user decision. A future
durable event queue would require a different product contract and storage
threat model.

## Client behavior

A desktop client:

- pairs/request-upgrades with `events:receive`;
- discovers browser instances as today;
- opens one authenticated SSE connection for its selected browser;
- validates the event envelope and an allowlist of event names;
- treats duplicate event ids defensively even though Monocle does not replay;
- reconnects with backoff after disconnect; and
- never executes shell commands by concatenating payload strings.

The GitHub-to-IDE client should map `github.openRepository` to a typed internal
IDE action, not expose a generic “run this command” event.

## Store and privacy impact

Native events do not add a new browser permission beyond the existing optional
`nativeMessaging`, but they expand the data flowing to paired apps. Update:

- pairing copy and scope approval;
- Chrome privacy disclosure;
- Firefox optional data categories/consent;
- Native Bridge protocol docs;
- the privacy policy; and
- reviewer notes.

Native messaging does not remove Firefox's requirement to disclose data sent to
a local native application. See
[security-and-store-review.md](./security-and-store-review.md).

## Acceptance tests

### Shared protocol and extension

- Scope validation and re-pairing behavior.
- Strict request/response/event discrimination.
- Correlation, timeout, disconnect rejection, and reconnect.
- Client-id authorization and revoked-token refusal.
- Payload interpolation/caps and sensitive logging.

### Rust daemon

- Origin rejection and bearer/target forwarding for `/events`.
- Single/multiple browser routing.
- Same-relay client targeting.
- Replacement of an older subscription.
- Bounded-channel backpressure, no-subscriber error, and cleanup.
- Correct acknowledgement after enqueue only.

### Client/manual

- Chrome and Firefox subscriptions with independent tokens.
- Two browsers connected simultaneously.
- Revoke while connected.
- Bridge/daemon restart and backoff reconnect.
- No replay after reconnect.
- An action produces exactly one typed IDE event.

## STOP conditions

Stop rather than improvise if:

- HTTP/inline action contracts changed in a way that makes JSON interpolation
  or action entry points incompatible;
- the native host cannot acknowledge an extension-originated frame without
  violating native-message framing limits;
- a client requires offline/durable delivery;
- product requirements require broadcast or arbitrary shell-command events;
- scope upgrades cannot be made explicit in the Integrations UI; or
- current Chrome/Firefox policy makes the proposed data consent insufficient.

