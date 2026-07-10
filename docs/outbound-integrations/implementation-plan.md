# Outbound Automation Integrations — Implementation Plan

> **Status: Phases 1–2 and the source/document portion of Phase 3 were implemented on 2026-07-11.** Automated tests, typecheck, formatting, and Chrome/Firefox builds pass. Manual cross-browser acceptance and external store/privacy disclosures remain release gates. Phase 4 native events remains deferred.

## Objective

Deliver outbound automation integrations in four independently reviewable phases:

1. Add safe selector-anchored automation buttons by extending Surfaces with an `inline` kind and automation-owned action routing.
2. Add a bounded, permission-gated `httpRequest` automation operation.
3. Complete disclosure, editor, import-review, documentation, and cross-browser release work.
4. Later, add scoped native-bridge event delivery over authenticated SSE.

Phases 1–3 form the HTTP release. Phase 4 is explicitly deferred and must not block it.

This plan implements the contracts in:

- [Inline automation UI](./inline-automation-ui.md)
- [HTTP request step](./http-request-step.md)
- [Security and store review](./security-and-store-review.md)
- [Deferred native bridge events](./native-bridge-events.md)

The complete acceptance scenario is in [GitHub to IDE example](./github-to-ide-example.md).

## Executor contract

Before changing source code:

1. Read this entire folder and the existing canonical docs named in each phase.
2. Confirm that `b43f2ac` is an ancestor of the working commit.
3. Inspect both committed drift and uncommitted drift for every listed code area.
4. Preserve unrelated work. In the investigation worktree, `options/pages/automations/editorState.ts` and `StepRow.tsx` already had uncommitted user edits that exposed additional step types; reconcile those edits rather than replacing them.
5. Update canonical behavior docs in the same phase as the source behavior they describe.
6. Keep automation export/schema version at v1 unless additive parsing proves impossible. It should not be necessary for the proposed contract.

Recommended drift commands:

```bash
git merge-base --is-ancestor b43f2ac HEAD
git diff --stat b43f2ac..HEAD -- apps/extension packages/native-bridge-protocol apps/bridge apps/raycast docs
git diff --stat -- apps/extension packages/native-bridge-protocol apps/bridge apps/raycast docs
git status --short
```

For each file about to be edited, inspect both views:

```bash
git diff b43f2ac..HEAD -- path/to/file
git diff -- path/to/file
```

### Global STOP conditions

Stop and obtain an architectural decision if any of these becomes true:

- The current tree already implements a materially different outbound or inline-action contract.
- Safe action routing would require sending executable step definitions to content code.
- Product requirements expand to arbitrary HTML, arbitrary DOM events, forms, page-origin styling, or arbitrary JavaScript.
- A browser cannot express the required CSP without allowing general plaintext remote HTTP.
- Firefox’s current policy or supported manifest version cannot express the proposed optional data-consent posture.
- Supporting the requested behavior would require ambient cookies, redirects, automatic retries, private-window transmission, a durable delivery queue, or broadcast-to-all-native-clients.
- A destination permission cannot be represented and re-checked as a concrete scheme+host pattern. Browser match patterns are intentionally broader than a configured URL's port/path; if product requires port-specific browser grants, stop because Firefox cannot provide them.
- More than two focused attempts fail at the same verification gate without a new diagnosis. Record the failure and stop instead of weakening the test or security rule.

Never place real bearer tokens, endpoint credentials, personal data, or captured request bodies in fixtures, logs, screenshots, or commits.

## Baseline excerpts

These observations are the minimum current-state context an executor needs. [Current state](./current-state.md) contains the full trace.

| Area at `b43f2ac` | Current behavior | Required change |
| --- | --- | --- |
| `shared/types/automations.ts` and `automationValidation.ts` | `showSurface` accepts only automation overlay/badge content. No placement or action-owned steps. | Add `inline`, static placement, and 1–5 declarative actions with nested steps. |
| `background/automations/engine.ts` | `showSurface` copies passive content into the surface store. Engine entry points are manual and trigger runs over top-level steps. | Project render-only action metadata; add a verified fresh `surfaceAction` invocation; execute `httpRequest`. |
| `shared/types/surfaceValidation.ts` | Surface kinds are overlay, badge, modal, and picker. | Add `inline`, placement, and safe action metadata without executable definitions. |
| `shared/components/SurfaceHost.tsx` | Renders existing surface kinds and emits `{ownerId, surfaceId, actionId}` for existing actions. | Keep that minimal event envelope; move inline placement into a page-adjacent host renderer. |
| `background/messages/surfaceAction.ts` | Routes feature and command owners. Automation routing is explicitly absent. | Validate the sender’s real tab and URL, confirm the active surface/action, then re-read and invoke the automation. |
| `background/automations/lowering.ts` | Background engine operations do not include outbound HTTP. | Classify `httpRequest` as a privileged engine operation, never a content-workflow op. |
| `shared/utils/automation-introspection.ts` | Structural walking handles branches and loops only. | Traverse surface action steps for caps, summaries, import review, trigger disarming, and data-source analysis. |
| `wxt.config.ts` | Broad optional hosts are declared, but production `connect-src` is narrower than the proposed destinations. | Retain optional declaration, request concrete origins, and permit HTTPS plus exact loopback HTTP in CSP. |
| Native bridge protocol/daemon | Request/response methods are suggestions and execute; the native port responds to host requests; the daemon drops unmatched frames. | Deferred: add event scope, correlated bidirectional frames, bounded subscriber routing, and SSE. |

Existing invariants must remain intact:

- Background code owns privileged browser APIs and executable automation policy.
- Content/UI receives serializable render data, never functions or action steps.
- Selectors are not interpolatable.
- Unsupported operations fail loudly.
- Imported non-manual triggers remain disarmed.
- Browser permission truth overrides stored UI state.
- The workflow vocabulary remains content-executable only; `httpRequest` and native delivery do not enter it.

## Workstream status

Use this table as the handoff progress ledger. Update it in the implementation branch as work lands.

| Phase | Priority | Size | Risk | Depends on | Current status |
| --- | --- | --- | --- | --- | --- |
| 1. Inline automation UI and action routing | P1 | Large | High | — | Implemented; manual browser smoke pending |
| 2. Outbound HTTP operation and permission enforcement | P1 | Large | High | Phase 1 action traversal; action UI may ship behind a flag independently | Implemented; live endpoint smoke pending |
| 3. Release integration, disclosures, and cross-browser acceptance | P1 | Medium | Medium | Phases 1–2 | Source/canonical docs complete; manual QA + external disclosures pending |
| 4. Native bridge events over SSE | P2 | Large | High | Stable action model and shipped HTTP behavior | Deferred |

### 2026-07-11 implementation verification

- `pnpm test`: 118 test files, 820 tests passed.
- `pnpm run tsc` and `pnpm run fmt:check`: passed.
- `pnpm run build` and `pnpm run build:firefox`: passed.
- Generated Chrome and Firefox manifests contain `https:` plus only exact
  `localhost`, `127.0.0.1`, and `::1` plaintext sources in `connect-src`.
- Firefox output declares minimum version 140 and the six optional outbound
  data categories documented in the security review.
- Manual GitHub SPA, authenticated loopback/HTTPS endpoint, denial/revocation,
  and private-window checks remain intentionally open and block release.

Suggested branches and commits:

```text
james/outbound-automation-inline
  feat(automations): add inline surface actions

james/outbound-automation-http
  feat(automations): add outbound http requests

james/outbound-automation-release
  docs(automations): document outbound data behavior

james/native-bridge-events
  feat(native-bridge): add scoped event delivery
```

If one branch is used, retain these boundaries as separate commits. Do not combine the deferred native phase with the store submission for HTTP.

## Phase 1 — Inline automation UI and action routing

### Outcome

An automation can declare fixed Monocle-styled buttons adjacent to a statically selected page element. The buttons render in closed shadow roots in every matching tab. Clicking one causes the background to verify the active surface and execute the corresponding stored steps as a fresh automation run.

### Canonical docs to read first

- `docs/automations.md`
- `docs/surfaces.md`
- `docs/workflow-automation.md`
- `docs/messaging.md`
- `docs/permissions.md`

### Primary code areas

| Responsibility | Existing or proposed path |
| --- | --- |
| Automation document types | `apps/extension/shared/types/automations.ts` |
| Automation validation | `apps/extension/shared/types/automationValidation.ts` |
| Surface render contract | `apps/extension/shared/types/surface.ts`, `surfaceValidation.ts` |
| Nested-step walking and summaries | `apps/extension/shared/utils/automation-introspection.ts`, `automation-summary.ts` |
| Engine invocation and `showSurface` projection | `apps/extension/background/automations/engine.ts` |
| Surface persistence/query | `apps/extension/background/surfaces.ts` |
| Action message verification | `apps/extension/background/messages/surfaceAction.ts` |
| Existing generic surface UI | `apps/extension/shared/components/SurfaceHost.tsx` |
| Inline DOM lifecycle | `apps/extension/content/surfaces/InlineSurface.tsx` and `inlineSurfaceController.ts` |
| Content integration | `apps/extension/content/scripts.tsx`, and only if required `entrypoints/content.tsx` |
| Options editor | `apps/extension/options/pages/automations/stepEditors/outboundSteps.tsx` plus the typed step-editor registry |

Use the exact final filenames that fit the repository after drift inspection. The intent is a feature-owned content folder and a focused editor component, not another large branch in `StepRow.tsx`.

### Implementation sequence

#### 1.1 Define separate authoring and render contracts

- Add `InlinePlacement`, `SurfaceAction`, and `inline` exactly as specified in [Inline automation UI](./inline-automation-ui.md).
- The automation authoring action adds required, non-empty `steps: AutomationStep[]`.
- The stored/rendered surface action contains only `id`, `label`, optional `icon`, and optional `style`.
- Require a static non-empty selector, optional non-negative `index`, one placement enum, and 1–5 actions.
- Reject duplicate action IDs within a surface and raw markup fields at validation boundaries.
- Do not interpolate selector, index, position, action IDs, labels, icons, or styles.
- Count nested action steps toward the existing 100-step and nesting limits. Recursion must use the same central walker as branches/loops; do not add isolated ad hoc counts.
- Keep schema and export version v1.

Focused tests:

- Extend `background/automations/validation.test.ts` for caps, duplicate IDs, invalid selectors as strings versus selector syntax at render time, placement, raw-HTML rejection, and nested limits.
- Extend `shared/utils/automation-introspection.test.ts` for action-step traversal and automatic-trigger disarming discovery.
- Extend `options/pages/automations/editorState.test.ts` for add/edit/serialize/parse round-trips.

STOP if the only way to express recursive `AutomationStep` validation creates an unsafe schema cycle or bypasses the existing document caps. Resolve the schema composition deliberately before UI work.

#### 1.2 Project safe metadata into the surface store

- In the `showSurface` engine case, map authoring actions to render-only actions.
- Keep owner ID `automation:<automationId>` and persist no executable steps in `monocle-surfaces`.
- Preserve the existing session-scoped, URL-global surface model so all matching tabs query the same definition.
- Keep removal explicit through `hideSurface`; target disappearance only unmounts the DOM host, not the stored definition.
- Confirm startup cleanup and URL filtering still apply to `inline` surfaces.

Focused tests:

- Extend `background/surfaces.test.ts` to cover inline serialization, URL visibility, session cleanup, removal, and render-only data.
- Extend `background/automations/engine.test.ts` to assert that action steps do not appear in persisted surface values.

#### 1.3 Implement the page-adjacent closed-shadow renderer

- Query the static selector and choose `index ?? 0` from the current matches.
- Insert one extension-owned host with `before`, `prepend`, `append`, or `after` semantics.
- Attach a closed shadow root and render only the fixed Monocle button component and styles.
- Use a `MutationObserver` to wait for a late target, detect replacement/removal, and remount after SPA rerenders.
- Coalesce observation work; do not perform an unbounded full-document query for every mutation record.
- Use stable surface-derived host identity to avoid duplicate mounts across message refreshes and mutation callbacks.
- Treat invalid selector syntax and missing targets as recoverable inactive states. Do not throw into page code or remove the stored surface.
- Clean up observers, React roots, listeners, and host nodes when the surface becomes ineligible, is hidden, or content is disposed.
- Disable all buttons for that surface while an action request is in flight. Re-enable after success or failure.
- Display a concise extension-owned failure state for rejected action runs without exposing sensitive values.

Focused tests should cover a DOM-oriented helper/component suite under `content/surfaces/`:

- all four placement modes;
- late target appearance;
- GitHub-style target replacement;
- target removal and reappearance;
- invalid selector syntax;
- index selection and out-of-range recovery;
- closed-root creation and style isolation;
- mount/click de-duplication;
- cleanup and observer disconnection;
- busy-button behavior.

If the test DOM cannot introspect a closed root, inject a narrow renderer factory in tests. Do not open the production root for test convenience.

#### 1.4 Route an automation-owned action securely

- Retain the content message envelope `{ownerId, surfaceId, actionId}`.
- Require a sender tab ID and sender URL from the browser message sender; do not accept a URL claimed in the payload.
- Re-query active surfaces for that real URL and verify the exact owner, surface, action, and inline eligibility.
- Parse the automation ID from the namespaced owner, re-read the current automation document from storage, and locate the current authoring action by surface/action ID.
- Reject deleted, disabled, unknown, forged, stale, or URL-ineligible actions.
- Invoke a new engine entry point with trigger type `surfaceAction`, its real URL, surface ID, and action ID.
- Start with a new value bag: resolve literal/snippet variables again, then add the four proposed trigger values. Do not retain show-time runtime variables or secrets.
- Give the run manual `runCommand` policy, but pass an explicit `allowPermissionPrompt: false` execution capability. A missing permission fails visibly with an Automations-settings direction.
- Add a per-automation or per-surface-action in-flight guard so double-clicks and duplicate messages cannot overlap. Define whether unrelated actions can run concurrently; the safest v1 default is one active run per automation ID.
- Ensure engine runtime and step limits apply to the nested action run exactly as for top-level runs.

Focused tests:

- Extend `background/messages/surfaceAction.test.ts` for forged owner/surface/action IDs, missing sender tab/URL, URL mismatch, stale surface, disabled/deleted automation, and feature/command regression.
- Extend `background/automations/engine.test.ts` for fresh literal/snippet values, reset runtime values, trigger context, manual `runCommand` policy, no permission prompt, revocation, concurrent-run rejection, and nested runtime limits.

STOP if sender information cannot reliably identify the tab and real URL for the target browsers. Do not substitute payload trust.

#### 1.5 Add focused editor support

- Reconcile the existing uncommitted step-list work before editing `editorState.ts` or `StepRow.tsx`.
- Add a dedicated inline-surface editor for placement and 1–5 buttons.
- In v1, edit each action’s nested steps through the existing validated JSON-editor precedent. Validate on change and show the exact nested path for errors.
- Do not add HTML, free-form CSS, arbitrary DOM event names, or JavaScript fields.
- Show that an inline surface appears in every matching tab and remains until `hideSurface` runs.

Focused tests:

- Builder round-trip preserves placement and nested action steps.
- Deleting/reordering actions retains stable IDs.
- Invalid JSON or invalid nested steps cannot be saved.
- Existing overlay/badge editing remains unchanged.

### Phase 1 verification

Run focused tests during implementation, then at minimum:

```bash
pnpm --filter @monocle/extension test -- background/automations/validation.test.ts
pnpm --filter @monocle/extension test -- shared/utils/automation-introspection.test.ts
pnpm --filter @monocle/extension test -- background/surfaces.test.ts
pnpm --filter @monocle/extension test -- background/messages/surfaceAction.test.ts
pnpm --filter @monocle/extension test -- background/automations/engine.test.ts
pnpm --filter @monocle/extension test -- options/pages/automations/editorState.test.ts
pnpm run tsc
pnpm run fmt:check
```

If the package filter name has drifted, use the equivalent command from `apps/extension/package.json`; do not guess in CI.

### Phase 1 definition of done

- No executable steps or functions cross into content or surface storage.
- All four placements work in closed shadow roots with late/remounted targets.
- Forged or stale action messages cannot start a run.
- Action runs have fresh values, bounded execution, no permission prompts, and visible safe failures.
- Existing surface kinds and feature/command action routing still pass.

## Phase 2 — Outbound HTTP operation

### Outcome

Automations can send bounded JSON requests to explicitly granted HTTPS origins or exact loopback HTTP origins. Responses influence later steps only through declared scalar mappings. Private-window delivery, redirects, ambient authentication, and remote HTTP are rejected.

### Canonical docs to read first

- `docs/automations.md`
- `docs/automation_context.md`
- `docs/permissions.md`
- `docs/settings-page.md`
- `docs/store-submission.md`
- `docs/messaging.md`

### Primary code areas

| Responsibility | Existing or proposed path |
| --- | --- |
| Step contract and schema | `apps/extension/shared/types/automations.ts`, `automationValidation.ts` |
| Operation classification | `apps/extension/background/automations/lowering.ts` |
| Interpolation | `apps/extension/background/automations/interpolate.ts` plus a focused structured-JSON helper |
| HTTP policy/execution | `apps/extension/shared/utils/http-request-policy.ts`, `background/automations/httpRequest.ts`, and `outboundDataConsent.ts` |
| Engine integration | `apps/extension/background/automations/engine.ts` |
| Host origin checks/grants | `apps/extension/background/utils/hostPermissions.ts`, `background/messages/hostPermissions.ts` |
| Introspection and import summary | `apps/extension/shared/utils/automation-introspection.ts`, `automation-summary.ts`, options import/export review code |
| Manifest/CSP and Firefox consent | `apps/extension/wxt.config.ts`, options permission/settings UI, focused background messages |
| Editor | focused inline/HTTP forms in `options/pages/automations/stepEditors/outboundSteps.tsx` |

### Implementation sequence

#### 2.1 Define and validate the operation

- Add `JsonValue` and `HttpRequestStep` exactly as specified in [HTTP request step](./http-request-step.md).
- Validate the method allowlist, static URL, header-name allow/deny rules, structured JSON body, timeout range, mapping paths, flat variable names, and duplicate mapping destinations.
- Reject URL interpolation markers, credentials, fragments, non-HTTP(S) schemes, remote plaintext HTTP, and bodies on GET.
- Permit plaintext only when the parsed hostname is exactly `localhost`, `127.0.0.1`, or `::1`. Do not use suffix, substring, DNS-resolution, or numeric-alias checks.
- Classify `httpRequest` as an engine operation. Do not add it to `shared/types/workflow.ts` or content workflow validation/execution.
- Traverse HTTP steps nested inside surface actions in all introspection and import paths.

Focused tests:

- Extend validation and lowering tests for every method and URL class, encoded credentials, fragments, loopback ports, IPv6 notation, GET body, timeout bounds, forbidden headers, response-path components, and nested action discovery.

#### 2.2 Build a bounded request executor

- Put URL/header/body/response policy in a focused helper with no browser UI dependencies.
- Interpolate header values and only string leaves of the structured body. Never interpolate the URL, method, header names, or response paths.
- Serialize before fetch and reject a UTF-8 body larger than 64 KiB.
- Apply `credentials: "omit"`, `cache: "no-store"`, `redirect: "error"`, no referrer, and an abort signal.
- Default timeout to 10 seconds and cap at 30 seconds.
- Do not retry automatically.
- Read the response stream incrementally and abort/reject once more than 64 KiB is observed. Do not call an unbounded `response.text()` first.
- Accept only 2xx status. If mappings are declared, parse the bounded bytes as JSON and resolve exact object keys/array indices.
- Map only string/number/boolean/null leaves to the existing flat string bag. Missing optional paths map to `""`; missing required paths and object/array leaves fail.
- Set `statusToVar` only on a successful response.
- Return typed, redacted errors: URL origin and method may be shown; headers, body, response body, and mapped values may not.

Focused unit tests for the proposed helper must cover:

- request options and absence of credentials/referrer/retries;
- request size at 64 KiB and one byte over;
- response chunks crossing the cap;
- abort timeout;
- redirects and non-2xx responses;
- empty/invalid JSON;
- scalar mappings, array indices, missing optional/required paths, and aggregate-value rejection;
- redacted error/log output.

#### 2.3 Enforce private-mode, origin grants, and CSP before fetch

- Resolve the real initiating tab and reject incognito/private tabs before request construction or fetch.
- Convert the static URL to the concrete scheme+hostname permission pattern and re-check `browser.permissions.contains` on every execution.
- Reuse the existing wildcard `optional_host_permissions` declaration, but request only that destination scheme+host pattern from an explicit Automations-settings control.
- Document and display browser grant granularity: the pattern omits path and, for Chrome/Firefox parity, port. Keep the configured static URL authoritative for the actual port and path.
- Automatic triggers and surface-action runs never open a permission prompt. A manual top-level run may direct the user to the settings grant control; avoid prompting mid-run.
- On denial or revocation, fail before interpolation that could expose values and before network activity.
- Update production CSP `connect-src` to HTTPS plus the exact supported loopback HTTP sources. Do not add `http:` or `*` to `connect-src`.
- Verify Chrome and Firefox generated manifests rather than assuming WXT emits equivalent syntax.

Focused tests:

- Extend host-permission tests for concrete HTTPS and loopback scheme+host patterns, grant/deny/revoke, deterministic port omission, and no wildcard-host requests.
- Extend engine tests for private sender rejection and pre-fetch permission failure.
- Extend `wxt.config.test.ts` to assert allowed HTTPS, exact loopback HTTP, and rejected general remote HTTP CSP posture.

STOP if the generated manifest cannot permit IPv6 loopback without a broad HTTP source. Ship the exact safe subset that both browsers support and document the limitation; do not broaden CSP.

#### 2.4 Add Firefox outbound-data consent

- Reconfirm current Mozilla policy and WXT/Firefox manifest support at implementation time.
- Correct active-tab URL/title classification from `websiteActivity` to `browsingActivity`.
- Draft optional categories: `authenticationInfo`, `browsingActivity`, `personallyIdentifyingInfo`, `searchTerms`, `websiteActivity`, `websiteContent`, retaining required `none`, as described in [Security and store review](./security-and-store-review.md).
- Before enabling outbound delivery, request the applicable optional data consent in a user-visible settings flow.
- Store no surrogate “granted” truth that can override the browser. Re-check consent at execution and block after denial or revocation.
- Keep Chrome destination grants and Firefox data consent conceptually separate in UI and code.

Focused tests must cover grant, denial, and revocation. If browser APIs cannot be unit-tested faithfully, isolate the adapter and require the manual checks in Phase 3.

STOP for current-policy sign-off if category requirements, local-native transmission treatment, or API support differ from this proposal.

#### 2.5 Add a focused editor and import review

- Add an HTTP step editor for method, static destination, headers, JSON body, timeout, and response mappings.
- Never render secret header values in review summaries, logs, or validation telemetry. The editor may display what the user entered while actively editing their local automation.
- Enumerate every method and normalized destination origin in import review.
- Enumerate header names only, never values.
- Enumerate every action entry point containing outbound steps and every possible source category that can reach interpolated header/body string leaves.
- Warn that GET has no body, only 2xx succeeds, response is capped, and redirects/retries/cookies/private-mode delivery are disabled.
- Ensure importing an automation with outbound steps anywhere in its tree disarms non-manual triggers.
- Use the validated JSON-editor precedent for structured bodies if a richer tree editor would expand the release.

Focused tests:

- Editor round-trips all supported JSON scalar/aggregate shapes.
- Summaries find HTTP nested under branches, loops, and surface actions.
- Summaries never include header values, body data, response data, or mapped values.
- Import disarms automatic triggers for every nesting position.

### Phase 2 verification

```bash
pnpm --filter @monocle/extension test -- background/automations/validation.test.ts
pnpm --filter @monocle/extension test -- background/automations/lowering.test.ts
pnpm --filter @monocle/extension test -- background/automations/engine.test.ts
pnpm --filter @monocle/extension test -- background/messages/hostPermissions.test.ts
pnpm --filter @monocle/extension test -- background/utils/hostPermissions.test.ts
pnpm --filter @monocle/extension test -- shared/utils/automation-introspection.test.ts
pnpm --filter @monocle/extension test -- options/pages/automations/editorState.test.ts
pnpm --filter @monocle/extension test -- wxt.config.test.ts
pnpm run tsc
pnpm run fmt:check
```

### Phase 2 definition of done

- Static destination, transport, size, timeout, redirect, and header policies are enforced both at save/import and immediately before fetch.
- Browser origin permission and Firefox consent are re-checked at execution.
- No request occurs from an incognito/private tab.
- Only declared scalar mappings can affect later steps.
- Sensitive request/response material cannot appear in logs, summaries, or user-visible errors.

## Phase 3 — Release integration, disclosures, and acceptance

### Outcome

The HTTP release is understandable to users and reviewers, works in Chrome and Firefox, and passes the GitHub-to-IDE scenario without permissive CORS or a native bridge dependency.

### Documentation and listing work

Update current-behavior docs when the implementation exists:

- `docs/automations.md`
- `docs/automation_context.md`
- `docs/surfaces.md`
- `docs/permissions.md`
- `docs/messaging.md`
- `docs/store-submission.md`
- `docs/README.md` feature status if appropriate

Update external release material and reviewer notes wherever they are maintained:

- Chrome privacy fields and listing copy;
- public privacy policy;
- Firefox data-consent manifest and listing disclosure;
- reviewer notes describing user-authored destinations, exact grant flow, local HTTP restriction, no cookies/redirects/private mode, and how to reproduce with a local endpoint.

State plainly that user-authored automations can send user-selected values to user-configured endpoints. Do not describe this as “local only,” because remote HTTPS is supported.

### Manual acceptance matrix

Run the complete [GitHub to IDE example](./github-to-ide-example.md) in current Chrome and Firefox builds.

| Scenario | Required result |
| --- | --- |
| GitHub initial load | One inline button appears at the configured selector. |
| GitHub SPA navigation | Old host is removed/reused correctly; one button appears at the new matching target. |
| Target removed then restored | Button unmounts and later remounts without recreating the automation. |
| Multiple matching tabs | Each eligible tab renders; a click uses that tab’s real URL. |
| Double click | At most one action run starts. |
| Service-worker restart | Stored surface is reconciled according to session rules; stale actions cannot run. |
| Local IDE endpoint | `http://127.0.0.1:<port>` succeeds after the disclosed `http://127.0.0.1/*` browser grant and correct bearer auth. The request still uses only the configured port/path. |
| No permissive CORS | Background fetch succeeds without requiring page-origin CORS configuration. |
| Local auth missing/wrong | Safe non-2xx failure; no secret appears in UI/logs. |
| Remote HTTPS endpoint | Succeeds only after its distinct scheme+host grant. |
| Remote HTTP endpoint | Rejected before network activity. |
| Redirect response | Fails; redirect target is not followed. |
| Permission/consent revoked | Next execution fails before interpolation/fetch and points to settings. |
| Incognito/private tab | Inline UI may be governed by existing extension availability, but outbound execution is always rejected. |
| Firefox consent denied | Delivery remains disabled; other automation behavior remains usable. |

Inspect extension background logs and page console during this matrix. Confirm they contain no authorization values, body values, response data, or mapped values.

### Required release gates

From the repository root:

```bash
pnpm run tsc
pnpm run fmt:check
pnpm test
pnpm run build
pnpm run build:firefox
```

Also inspect the generated Chrome and Firefox manifests for:

- optional host permission shape;
- final `connect-src` values;
- Firefox data-consent declarations;
- absence of a broad remote plaintext HTTP allowance.

### Phase 3 definition of done

- All automated gates pass.
- The full manual matrix passes in both browsers.
- Chrome disclosures, Firefox consent, privacy policy, listing copy, and reviewer notes agree with actual behavior.
- A reviewer can reproduce the GitHub-to-IDE flow from committed instructions without a real secret.
- Canonical docs describe shipped behavior; this proposal folder remains labelled as design history/handoff.

STOP release if disclosure or consent is incomplete even when the code passes.

## Phase 4 — Deferred native bridge events

### Entry criteria

Do not start this phase until:

- Phases 1–3 are shipped or otherwise stable.
- The surface-action execution model has real-world validation.
- There is a concrete client that cannot reasonably expose a loopback HTTP endpoint.
- Product accepts at-most-once, live-subscriber-only semantics.

### Canonical docs to read first

- `docs/native-messaging/` in full
- `docs/automations.md`
- `docs/permissions.md`
- `docs/store-submission.md`

### Primary code areas

| Responsibility | Paths |
| --- | --- |
| Shared scopes and frames | `packages/native-bridge-protocol/src/index.ts`, `validation.ts`, `wire.ts` |
| Extension port and policy | `apps/extension/background/features/nativeMessaging/port.ts`, `reconnect.ts`, `commands.ts`, `index.ts` |
| Automation contract/engine | automation type, validation, introspection, summary, editor, and engine paths from Phase 2 |
| Daemon SSE/routing | `apps/bridge/src-tauri/src/daemon.rs`, `framing.rs`, `registry.rs`, `relay.rs` |
| Client pairing/subscription | `apps/raycast/src/lib/auth.ts`, `bridge.ts`, `types.ts`, and equivalent IDE client code |
| Native docs | `apps/bridge/README.md`, `docs/native-messaging/`, canonical automation docs |

### Implementation sequence

#### 4.1 Add explicit scope and protocol frames

- Add `events:receive`; existing tokens never gain it through migration or defaulting.
- Require re-pairing or an explicit approval that issues a new scoped token.
- Add a separate `sendBridgeEvent` automation step with static `clientInstanceId` and `eventName`, plus structured payload whose string leaves interpolate.
- Apply the same nesting traversal, 64 KiB serialized payload cap, private-mode rejection, sensitive logging rules, import review, and trigger disarming used for HTTP.
- Define correlated extension↔daemon event frames and acknowledgements separately from suggestion/execute requests.

#### 4.2 Generalize the extension native port

- Replace the request-only assumption with a typed multiplexer for inbound requests, outbound events, and correlated acknowledgements.
- Keep the extension authoritative for paired tokens/scopes, automation policy, and client targeting.
- Send only to one static paired `clientInstanceId`; no wildcard or broadcast value.
- Fail the automation step on disabled bridge, missing/revoked scope, unavailable port, acknowledgement timeout, no subscriber, or daemon backpressure.
- Reconnect must not replay unacknowledged events.

#### 4.3 Add authenticated SSE to the daemon

- Add authenticated `GET /events` on the loopback daemon.
- Require the existing browser-instance routing header, paired client identity/token, and `events:receive` scope.
- Maintain a bounded live channel per authenticated client/browser route.
- Queue to the live subscriber before acknowledging the extension frame.
- If no subscriber exists or the bounded channel is full, return a negative acknowledgement immediately.
- Do not persist, replay, broadcast, or interpret payloads.
- On SSE reconnect, only future events are eligible.

#### 4.4 Update clients and pairing UX

- Show the new scope during pairing/approval.
- Existing clients continue to use their old scopes but cannot subscribe.
- The IDE or Raycast subscriber reconnects with normal SSE behavior and treats gaps as expected at-most-once semantics.
- Document event names and payloads as client/application contracts, not daemon-owned schemas.

### Phase 4 tests

Required coverage:

- validation and schema compatibility for old tokens/documents;
- no implicit scope upgrade;
- authenticated/unauthenticated SSE;
- wrong browser-instance or client routing;
- multi-browser and multi-client isolation;
- live delivery acknowledgement;
- no-subscriber and revoked-scope failure;
- bounded-channel backpressure;
- reconnect without replay;
- port reconnect and correlation races;
- payload cap and sensitive logging;
- disabled bridge and acknowledgement timeout.

Required gates:

```bash
pnpm run tsc
pnpm run fmt:check
pnpm test
pnpm run build
pnpm run build:firefox
cargo test --manifest-path apps/bridge/src-tauri/Cargo.toml
pnpm run build:bridge
```

### Phase 4 definition of done

- Only explicitly re-paired/scoped clients can subscribe.
- A successful automation step means the daemon queued the event to the targeted live authenticated subscriber.
- No subscriber, scope failure, timeout, or backpressure is an automation failure.
- Delivery remains at-most-once with no storage/replay.
- HTTP remains the documented default outbound transport.

## Cross-phase test ownership

The same invariant should have one primary test owner and only targeted integration coverage elsewhere.

| Invariant | Primary test area |
| --- | --- |
| Document shape and static fields | `background/automations/validation.test.ts` |
| Nested action traversal/caps/summaries | `shared/utils/automation-introspection.test.ts` and summary/import tests |
| Surface render-only persistence | `background/surfaces.test.ts`, `background/automations/engine.test.ts` |
| DOM placement and SPA lifecycle | focused `content/surfaces/*.test.tsx` |
| Sender/action verification | `background/messages/surfaceAction.test.ts` |
| Fresh run variables and concurrency | `background/automations/engine.test.ts` |
| HTTP policy and byte limits | focused `background/automations/httpRequest.test.ts` |
| Concrete origin grants | existing host-permission test files |
| Manifest/CSP | `wxt.config.test.ts` plus generated-manifest inspection |
| Editor round-trip | `options/pages/automations/editorState.test.ts` and focused editor tests |
| Native framing/routing | protocol package tests, extension port tests, Rust unit/integration tests |

Avoid giant end-to-end unit fixtures that duplicate all of these rules. The manual browser matrix owns page integration and store-consent behavior that mocks cannot prove.

## Final handoff checklist

For each completed phase, record:

- commit SHA and branch;
- source/doc paths changed;
- focused tests added;
- exact verification commands and outcomes;
- browser versions used for manual checks;
- generated-manifest findings;
- remaining STOP condition or follow-up, if any;
- screenshots only when they contain no user or secret data.

The implementation is not complete merely because a happy-path request reaches an IDE. Completion means the declarative boundary, sender verification, permissions, consent, size limits, failure semantics, sensitive logging, import review, cross-browser behavior, and documentation all agree.
