# Current State and Gap Analysis

> **Status: current-state investigation; proposed work is not implemented.**
> Source references and excerpts below describe commit `b43f2ac` unless a
> working-tree difference is called out explicitly.

## System boundary

The requested capability crosses four existing Monocle boundaries:

1. an Automation document stores fixed verbs and is validated at every boundary;
2. the background Automation engine interprets privileged verbs and lowers DOM
   verbs to content workflows;
3. the background Surfaces store projects declarative UI to the content
   `SurfaceHost`; and
4. an interaction returns through `monocle-surface-action`, where the background
   decides what the gesture means.

That is already almost the right skeleton. The missing work is an inline
renderer, an automation action entry point, and an outbound engine verb—not a
new page-to-background execution channel.

## Automations can show passive surfaces

`apps/extension/shared/types/automations.ts:218-238` limits automation-owned
surfaces to two kinds:

```ts
export type AutomationSurfaceKind = "overlay" | "badge"

export type ShowSurfaceStep = EngineStepBase & {
  op: "showSurface"
  surfaceId: string
  kind: AutomationSurfaceKind
  urlMatch?: SurfaceUrlMatch
  blocking?: boolean
  content: AutomationSurfaceContent
}
```

`apps/extension/shared/types/automationValidation.ts:386-393` repeats that
closed set in the runtime schema. `background/automations/engine.ts:638-660`
interpolates the surface title/text and calls `upsertSurface` under
`automation:<scriptId>`; `hideSurface` removes it. There is no action
definition, CSS placement, or action continuation in the document model.

This means the answer to “can Automations add UI?” is:

- **yes** for a session-scoped passive overlay or badge described by fixed data;
- **no** for a selector-anchored control that responds to a user click.

## Surfaces are the correct extension point

`apps/extension/shared/types/surfaceValidation.ts:22-67` is the canonical
surface schema. It accepts `overlay`, `badge`, `modal`, and `picker` and keeps
the payload declarative. The persisted store in
`background/surfaces.ts:16-43` is owner-namespaced and broadcasts after every
mutation. `getSurfacesForUrl` applies URL and optional tab gating and stamps the
owner before returning a surface.

Automation and command owners are session-scoped:

```ts
const SESSION_OWNER_PREFIXES = ["automation:", "command:"]
```

`initSurfaces()` removes those owners on a new browser session. A URL-global
inline surface therefore naturally appears in all matching tabs once an
Automation has created it, survives service-worker suspension, and disappears
on a new browser session. A matching page trigger recreates it after restart.

The content renderer already refreshes on mount, SPA navigation, and the
`monocle-surfaces-changed` broadcast
(`shared/components/SurfaceHost.tsx:238-272`). It is therefore the natural
place to add selector lifecycle handling.

## Surface gestures exist, but Automation routing does not

`SurfaceHost` sends only identifiers and an optional picker selection:

```ts
sendRuntimeMessageSafe({
  type: "monocle-surface-action",
  ownerId: surface.ownerId,
  surfaceId: surface.id,
  actionId,
})
```

`background/messages/surfaceAction.ts:1-64` handles `dismiss`, command owners,
and feature owners. Its committed source says directly that automation routing
is not wired. An `automation:<id>` non-dismiss action falls through as an
unknown feature and returns `{ success: false }`.

The handler also does not currently prove that a non-dismiss surface/action is
active for the sender URL before invoking its owner. Picker actions are
extension-generated and constrained today, but Automation actions must add
that verification because they can trigger outbound effects.

## Action execution needs a second Automation entry point

`background/automations/engine.ts:99-119` recognizes only manual invocations
and background triggers. `runAutomation` always runs the document's top-level
`script.steps`, and `executeRun` sets permission-prompt behavior from whether
the invocation is manual.

An inline button should not replay the top-level setup steps. It needs an
entry point that:

- re-reads and validates the document;
- locates `showSurface(surfaceId).actions[actionId]`;
- pins execution to the sender tab;
- reuses the existing per-script/per-tab concurrency guard;
- builds a fresh value bag;
- treats the click as a user-initiated action for `runCommand` policy;
- forbids permission prompts during the continuation; and
- executes only the selected action's steps.

The flat value bag (`background/automations/interpolate.ts:87-109`) is
`Record<string, string>`. That supports explicit response mappings without a
new structured value system.

## Structural walkers must learn action steps

`shared/utils/automation-introspection.ts:57-71` descends only into branch and
loop children. The document-level structural check follows the same child
shapes. Once a surface action owns steps, every shared walker must include
them so that:

- nested steps count toward the 100-step cap;
- control-flow depth and navigation rules remain enforced;
- snippet references in HTTP headers/bodies resolve before execution;
- template warnings include action bodies;
- import summaries disclose nested outbound behavior; and
- `automationTouchesPage` sees DOM work performed after a button click.

This is a lockstep change, analogous to adding a workflow operation.

## The committed builder does not expose surface steps

At `b43f2ac`, `options/pages/automations/editorState.ts:215-240` omits
`showSurface`, `hideSurface`, `type`, and `key` from `STEP_OP_OPTIONS`, although
an already-imported unsupported form op round-trips through the JSON row path.

The observed working tree contains a user-owned patch that adds those missing
options and valid JSON defaults. That patch is not part of this proposal and
must be preserved. The future editor work should build on it rather than add a
competing step registry.

## There is no outbound HTTP Automation operation

At `b43f2ac`:

- `AutomationEngineStep` has no network operation;
- `ENGINE_OPS` in `background/automations/lowering.ts:18-31` has no network
  operation;
- the Automation engine imports no general-purpose fetch helper; and
- the only extension-owned fetch implementation is the fixed Unsplash request.

The manifest already declares broad optional web origins:

```ts
export const optionalHostPermissions = ["http://*/*", "https://*/*"] as const
```

but production `connect-src` contains only `'self'`, Unsplash, and DuckDuckGo
(`apps/extension/wxt.config.ts:47-66`). A background fetch to a user-chosen
destination therefore requires both a concrete granted origin and a deliberate
CSP expansion.

`background/utils/hostPermissions.ts` already provides origin derivation,
contains/request checks, and a dedicated grant-page flow. It is page-oriented
today and optionally ensures a content script. HTTP destinations should reuse
the origin-checking mechanics but add a distinct reason and skip content-script
injection.

## The native bridge is request/response only

The public bridge contract contains two scopes—`suggestions:read` and
`commands:execute`—and only caller-initiated methods
(`packages/native-bridge-protocol/src/wire.ts:30-34,172-191`).

The extension port listener treats every host message as a request and posts
its response (`background/features/nativeMessaging/port.ts:85-93`). The daemon
stores in-flight caller requests by envelope id. Frames received from the
browser are delivered only when their id matches that pending map
(`apps/bridge/src-tauri/src/daemon.rs:81-94`); unmatched frames are discarded.

Consequently, native messaging is not a small alternate implementation of an
HTTP Automation step. Outbound events require:

- a client subscription transport;
- a new paired-client scope and consent path;
- correlated extension-originated frames;
- daemon routing for unmatched event frames;
- live-subscriber and backpressure semantics; and
- an acknowledgement definition.

That is why HTTP is Phase 2 and native events are deferred to Phase 4.

## Gaps and conclusions

| Gap | Impact | Planned resolution |
| --- | --- | --- |
| No selector-anchored surface kind | Cannot place Monocle UI beside GitHub controls | Add `inline` to the canonical surface schema and content host. |
| No Automation surface actions | A rendered control cannot invoke Automation steps | Keep step bodies in the Automation document; send only action metadata to content. |
| No automation owner routing | `automation:<id>` actions are no-ops | Add verified owner routing and a fresh action-run entry point. |
| Walkers ignore action bodies | Caps, snippets, summaries, and warnings could be bypassed | Extend all structural/introspection walkers in the same change. |
| No outbound verb | Automations cannot send data to an IDE or webhook | Add a constrained background `httpRequest` engine step. |
| CSP is fixed-host only | Arbitrary HTTPS/loopback fetches would be blocked | Add `https:` and exact loopback HTTP sources while rejecting remote HTTP in code. |
| Bridge has no subscriptions | Extension-originated events have nowhere to go | Defer authenticated SSE and `events:receive` scope. |

## Considered and rejected

- **Arbitrary HTML in an Automation:** rejected because it creates a
  sanitization/impersonation surface and undermines the store-safe “data, not
  code” posture.
- **A workflow `insertUi` DOM operation:** rejected because UI must outlive one
  workflow segment, survive service-worker suspension and SPA rerenders, and
  return gestures to a background owner. Surfaces already model that lifecycle.
- **Fetching from content:** rejected because content fetches retain page-origin
  constraints and would expose a dangerous “page asks background to fetch this
  URL” shape.
- **Native bridge first:** rejected because it adds subscription, scope,
  daemon, and client work without avoiding data-disclosure obligations.
- **Captured show-time values:** rejected because persisting a runtime value bag
  could retain page content or snippet secrets long after the setup run ends.

