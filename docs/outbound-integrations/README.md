# Outbound Automation Integrations

> **Status: proposed; not implemented.** This investigation and handoff package
> was written on 2026-07-10 against commit `b43f2ac`. The source code still has
> the current behavior described in [current-state.md](./current-state.md).

This folder answers two related product questions:

1. Can an Automation add UI to a page and react when the user clicks it?
2. How should that action send data from Monocle to a third-party application?

The short answer is **partly, but not enough yet**. Automations can already run
`showSurface` and `hideSurface`, but automation surfaces are passive overlays or
badges. They cannot be inserted beside a CSS-selected page element, they have no
button vocabulary, and `automation:<id>` surface actions are not routed back to
the automation engine.

The recommended direction is:

- extend the existing Surfaces subsystem with a declarative `inline` kind;
- allow that surface to expose fixed, Monocle-rendered click buttons whose
  action definitions remain in the Automation document;
- add a background-owned `httpRequest` Automation step as the first outbound
  transport;
- allow plaintext HTTP only for exact loopback hosts and require HTTPS
  everywhere else;
- keep Chrome and Firefox behavior aligned, including Firefox data-collection
  consent; and
- add native-bridge event delivery later, after the inline action and HTTP
  contracts have shipped and stabilized.

No design in this folder permits arbitrary HTML, arbitrary JavaScript, remote
step definitions, page-supplied request URLs, or executable response payloads.

## Reading order

| Document | Purpose |
| --- | --- |
| [current-state.md](./current-state.md) | Verified source-to-sink analysis and the exact gaps at `b43f2ac`. |
| [inline-automation-ui.md](./inline-automation-ui.md) | Proposed selector placement, renderer, action routing, and action-run semantics. |
| [http-request-step.md](./http-request-step.md) | Proposed HTTP schema, execution policy, permissions, response mapping, and editor behavior. |
| [security-and-store-review.md](./security-and-store-review.md) | Threat model and Chrome/Firefox submission implications. |
| [github-to-ide-example.md](./github-to-ide-example.md) | Complete target Automation and local IDE endpoint contract. |
| [implementation-plan.md](./implementation-plan.md) | Executor-ready phases, verification gates, STOP conditions, and status table. |
| [native-bridge-events.md](./native-bridge-events.md) | Deferred paired-client SSE transport, protocol, and daemon changes. |

## Dependency graph

```mermaid
flowchart LR
  current["Current-state investigation"] --> inline["Phase 1: inline UI"]
  current --> http["Phase 2: outbound HTTP"]
  inline --> example["GitHub-to-IDE acceptance"]
  http --> example
  http --> review["Security and store review"]
  inline --> plan["Implementation handoff"]
  http --> plan
  review --> plan
  example --> plan
  plan --> release["Phase 3: cross-browser release"]
  release --> native["Phase 4: deferred native events"]
```

HTTP can be developed independently for manual Automations, but the requested
GitHub control depends on both Phase 1 and Phase 2. Native events depend on the
stabilized action/payload model and are not a prerequisite for the HTTP release.

## Locked decisions

| Decision | Selected behavior | Reason |
| --- | --- | --- |
| Page UI | Fixed click buttons only in v1 | Covers the GitHub-to-IDE use case without adding form state or a markup language. |
| Styling | Closed-shadow, Monocle-owned rendering | Page CSS cannot restyle or impersonate the control. |
| Placement | Static CSS selector plus `before`/`prepend`/`append`/`after` | Reviewable, permission-independent, and sufficient for site augmentation. |
| Visibility | Every tab admitted by the surface URL rules | Matches existing URL-global surface storage and avoids per-tab identity migration. |
| Action values | Fresh run on click | Avoids persisting runtime values or secrets in the surface store. |
| First transport | Background HTTP request | Directly interoperates with IDEs and webhooks without requiring the Monocle Bridge app. |
| HTTP reach | Loopback HTTP plus arbitrary HTTPS | Supports local development while keeping remote transmission encrypted. |
| Response access | Explicit JSON-path-to-string mappings | Preserves the current flat `AutomationValueBag` instead of introducing structured variables. |
| Native events | Deferred authenticated SSE | Unidirectional delivery fits SSE; the current bridge has no subscription or unsolicited-frame path. |
| Automation version | Keep `schemaVersion: 1` | All changes are additive; existing documents remain valid. |

## Recommended execution order

| Phase | Deliverable | Depends on | Status |
| --- | --- | --- | --- |
| 1 | Inline Automation surfaces and safe action entry points | — | TODO |
| 2 | Outbound HTTP step, grants, consent, and response mappings | Phase 1 | TODO |
| 3 | Integrated editor, example, canonical docs, and browser QA | Phases 1–2 | TODO |
| 4 | Native-bridge event subscriptions and `sendBridgeEvent` | Phases 1–3 | DEFERRED |

Phase 2 can technically execute an HTTP step from a normal Automation before
Phase 1 lands, but the end-to-end feature depends on an inline button invoking
that step. Keeping the execution order above gives each phase a user-visible
acceptance path.

## Working-tree note

The repository was dirty when this package was written. In particular,
user-owned changes were present in the Automation editor and
`docs/automations.md`. The committed `b43f2ac` editor does not offer
`showSurface`/`hideSurface` in its Add Step selector; the uncommitted worktree
already begins correcting that gap. Every executor must run the drift check in
[implementation-plan.md](./implementation-plan.md), reconcile those changes,
and preserve them rather than reapplying or overwriting them.

## Definition of success

The feature is complete when a user can import or author the example in
[github-to-ide-example.md](./github-to-ide-example.md), grant only the IDE
endpoint's browser-managed scheme+host pattern, open matching GitHub pages in
multiple Chrome and Firefox tabs, see an isolated button beside the configured
selector, click it, and receive a bounded authenticated JSON request in the IDE.
Revoking the grant,
opening a private tab, returning a redirect, removing/replacing the GitHub
anchor, or supplying an invalid response must fail predictably without leaking
request or response data into logs.
