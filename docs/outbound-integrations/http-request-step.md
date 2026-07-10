# Outbound HTTP Automation Step

> **Status: proposed; not implemented.** This is the decision-complete contract
> for Phase 2 of [implementation-plan.md](./implementation-plan.md).

## Goal

Add a constrained background Automation verb that sends structured data to a
user-configured local application or HTTPS service and can map selected scalar
JSON response values into the existing string value bag.

The endpoint is locally authored configuration. No webpage message can supply
or override it, and a remote response can never define Automation steps.

## Document contract

```ts
type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

type HttpResponseMapping = {
  path: Array<string | number>
  toVar: string
  required?: boolean
}

type HttpRequestStep = EngineStepBase & {
  op: "httpRequest"
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  url: string
  headers?: Record<string, string>
  body?: JsonValue
  timeoutMs?: number
  response?: {
    statusToVar?: string
    json?: HttpResponseMapping[]
  }
}
```

`HttpRequestStep` is an `AutomationEngineStep`; it is not a content workflow
operation. Add it to `ENGINE_OPS` and execute it between content segments.

The Automation stays at `schemaVersion: 1`. Older documents remain valid; old
extension builds will correctly reject the unknown additive op rather than
misinterpret it.

## Validation

### Destination URL

Parse the literal `url` during schema refinement and again immediately before
fetching.

Accept:

- `https://` with a non-empty hostname; and
- `http://` only when `URL.hostname`, normalized to lowercase without IPv6
  brackets, is exactly `localhost`, `127.0.0.1`, or `::1`.

Reject:

- remote plaintext HTTP;
- `file:`, `data:`, `blob:`, extension, and every non-HTTP(S) scheme;
- username/password URL credentials;
- fragments;
- an empty hostname; and
- URLs longer than 2,000 characters.

The complete URL is static and is never interpolated. A query string may be
present only as literal document data; the editor warns that URLs commonly
appear in server logs and recommends putting dynamic/sensitive data in the JSON
body instead.

### Method and body

- `method` is required so import review never depends on a default.
- GET rejects `body`.
- POST, PUT, PATCH, and DELETE may omit `body`; when present it is serialized as
  JSON. Every non-GET request sets the engine-owned
  `Content-Type: application/json` header.
- Request JSON has a maximum nesting depth of 10 and 1,000 total nodes.
- Individual strings retain the existing 10,000-character Automation cap.
- After interpolation and serialization, the UTF-8 request body must be at most
  65,536 bytes.

String leaves in `body` are interpolated recursively. Numbers, booleans, null,
object keys, and array positions remain literal.

### Headers

Allow at most 20 headers. Header names are static, unique
case-insensitively, and at most 128 characters. Values are at most 8,192
characters before interpolation; the final encoded header values combined must
be at most 16 KiB.

Interpolate header values, including snippet references, but never header
names. Reject these names case-insensitively:

- `cookie`, `cookie2`, `host`, `origin`, `referer`, `content-length`,
  `connection`, `transfer-encoding`, `user-agent`;
- any name beginning `proxy-`; and
- any name beginning `sec-`.

`Authorization` is permitted because a local IDE or webhook commonly needs its
own credential. The editor recommends a snippet reference rather than a literal
token and warns that literal values are included in Automation exports.

The engine owns `Content-Type`; a user-supplied `content-type` header is
rejected. `Accept` and vendor-specific non-controlled headers are allowed.

### Timeout and response mapping

- `timeoutMs` defaults to 10,000 and is limited to 1,000–30,000.
- `statusToVar` and every `toVar` use the existing Automation variable-name
  grammar.
- `json` contains at most 20 mappings.
- A mapping path contains 1–10 string/number segments. String segments are
  literal object keys; number segments are non-negative array indices.
- Mapping paths and target variable names are not interpolated.

## Execution policy

Implement HTTP mechanics in a focused background module, with injected
`fetch`, clock/timeout, and permission dependencies for unit testing. The
Automation engine should only interpolate inputs, call the helper, merge mapped
values, and record a normal engine-step outcome.

Execution order:

1. Resolve the run's target tab and call `tabs.get(tabId)`.
2. Reject when the tab is private/incognito.
3. Re-validate the static endpoint policy.
4. Derive its concrete origin match pattern and call
   `permissions.contains({ origins: [pattern] })`.
5. Verify required Firefox data-collection consent when running on Firefox.
6. Interpolate allowed header/body strings against the current value bag.
7. Enforce post-interpolation byte caps.
8. Start `fetch` with an `AbortController` timeout and these fixed options:

```ts
{
  method,
  headers,
  body,
  credentials: "omit",
  cache: "no-store",
  redirect: "error",
  referrerPolicy: "no-referrer",
}
```

There are no automatic retries. A network failure may be ambiguous after the
remote service accepted a state-changing request, so retrying could duplicate
side effects.

Only status 200–299 succeeds. Record `statusToVar` as a decimal string only
after a 2xx response is accepted. Non-2xx failures report only the status
code—never response headers or body.

## Bounded parsed-JSON response

When no JSON mappings are requested, cancel the response body without reading
it. When mappings exist:

1. Read `response.body` incrementally with a stream reader and `TextDecoder`.
2. Cancel and fail as soon as more than 65,536 bytes are observed, regardless
   of `Content-Length`.
3. Parse the complete bounded text with `JSON.parse`; never evaluate or render
   it.
4. Resolve only the declared paths.
5. Convert mapped scalars as follows:
   - string → unchanged;
   - number/boolean → `String(value)`;
   - null → `"null"`.
6. Reject a mapped object or array.
7. A missing required path fails the step. A missing optional path writes `""`.

Mapped values are merged into `AutomationValueBag` only after every requested
mapping validates. This makes the update atomic: a later invalid mapping cannot
leave a partially updated bag.

Remote data may affect later locally-authored branches or interpolated values,
but it can never provide selectors, command ids, step arrays, markup, scripts,
or a second request destination.

## Permission and CSP flow

The existing `optional_host_permissions` declaration already covers broad
HTTP(S) origins. Keep that declaration, but request one concrete
scheme+hostname pattern at a time through an explicit “Grant endpoint access”
control in the Automation editor.

This is the narrowest cross-browser grant the WebExtensions API can express,
not a port- or path-specific web origin. Chrome documents that host-permission
paths are ignored and that `http://localhost/*` matches every localhost port;
Firefox does not support ports in match patterns. Therefore a configured
`http://127.0.0.1:43121/monocle/events` endpoint produces the browser grant
`http://127.0.0.1/*`. The static Automation URL and runtime endpoint validator
still pin the actual port and path. The grant UI must show both the configured
endpoint and this broader browser-managed grant scope.

- [Chrome match patterns](https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns)
- [Firefox match patterns](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns)

Do not request during action or automatic execution. Missing access produces a
clear result such as:

> Grant endpoint access for `https://api.example.com/*` in Automations settings,
> then run this action again.

Refactor the origin-only part of `background/utils/hostPermissions.ts` into a
shared helper without coupling HTTP destinations to content-script injection.
Keep page automation and Element Hider behavior unchanged.

Production extension CSP gains:

- `https:`;
- `http://localhost:*`;
- `http://127.0.0.1:*`; and
- `http://[::1]:*` if both Chrome and Firefox packaged-build validation accept
  that host-source syntax.

If either browser rejects the IPv6 CSP source, STOP and report rather than
broadening to general `http:`. Ship exact hostname/IPv4 loopback support first
and track IPv6 as a follow-up.

The runtime endpoint validator remains authoritative even when CSP is broader.

Firefox also requires the applicable optional data-collection permission before
the first request. The manifest and consent proposal are detailed in
[security-and-store-review.md](./security-and-store-review.md).

## Builder and import review

Add a focused `HttpRequestStepEditor` with:

- method select;
- static URL and derived origin grant state;
- custom header rows with sensitive-header guidance;
- structured JSON body textarea, parsed into `JsonValue` on blur with last-valid
  retention;
- timeout;
- optional status variable; and
- response mapping rows (`path` JSON array, target variable, required toggle).

Saving does not silently drop a step whose JSON body is temporarily invalid.
The shared Automation schema remains the source of truth.

Extend introspection and summaries so nested and top-level HTTP steps report:

- method and full static destination;
- custom header names, never values;
- whether body strings reference trigger/page, parameter, runtime, or snippet
  values;
- response target variable names; and
- whether execution is reachable from an automatic trigger or inline button.

Imported non-manual triggers remain disarmed. Import approval does not grant the
endpoint origin; the user performs that separate browser permission gesture in
the editor.

## Logging and errors

Never log or return request headers, request body, response headers, response
body, or mapped values. Step outcomes contain only op, optional step id,
success, and a sanitized error category/status.

Distinguish these user-facing failures:

- invalid/disallowed endpoint;
- missing endpoint grant;
- missing Firefox data consent;
- private-window refusal;
- request timed out;
- redirect refused;
- network failure;
- non-2xx status;
- response too large;
- invalid JSON; and
- missing/non-scalar mapped value.

## Acceptance tests

Unit tests must cover every accepted/rejected URL category, case-insensitive
header blocking, duplicate headers, request caps before and after interpolation,
GET body rejection, secure fetch options, missing/revoked grants, private tabs,
timeouts, redirects, network errors, every status family, chunked oversized
responses, invalid JSON, mapping paths through objects/arrays, atomic mappings,
and sensitive logging.

Integration tests must prove a validated `httpRequest` is classified as an
engine op, receives variables extracted by a preceding `getText`, supplies
mapped values to later steps, is traversed inside inline action bodies, and is
fully disclosed by import summaries.

Manual Chrome and Firefox verification uses the authenticated loopback endpoint
in [github-to-ide-example.md](./github-to-ide-example.md), plus one HTTPS test
endpoint. Test grant, denial, revocation, automatic-trigger no-prompt behavior,
service-worker restart, and incognito rejection.
