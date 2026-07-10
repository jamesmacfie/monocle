# 12 — Background Messaging and Validation (`MSG`)

Scope: the message router (`background/messages/index.ts`) and all handler
modules except `executeKeybinding.ts` (owned by file 14, referenced here only);
the validation layer (`background/utils/validation.ts`,
`shared/types/validation.ts`); runtime/messaging utilities
(`background/utils/messages.ts`, `background/utils/runtime.ts`,
`background/utils/messagingErrors.ts`); the wire contract
(`shared/types/messaging.ts`); the UI-side send boundary
(`shared/store/sendMessage.ts`, `shared/hooks/useSendMessage.tsx` — boundary
only, slice thunks belong to file 23); and `docs/messaging.md`.

All paths below are relative to the repo root.

---

### MSG-01: Align the transport string-size guard with the schema string limits

**Priority:** P0     **Effort:** S     **Type:** consistency

**Current state**
`exceedsMessageLimits` rejects any message containing a string field longer
than `MAX_STRING_LENGTH = 10000`
(`apps/extension/background/utils/validation.ts:42` and
`apps/extension/background/utils/validation.ts:75-105 (exceedsMessageLimits)`).
This guard runs *before* schema validation, inside `validateSender`
(`apps/extension/background/utils/validation.ts:126-132 (validateSender)`),
called first from `validateIncomingMessage`
(`apps/extension/background/utils/validation.ts:148`). Meanwhile the snippet
schema explicitly allows bodies up to 100,000 characters
(`apps/extension/shared/types/validation.ts:141-144 (SnippetBodySchema)`, used
by `AddSnippetMessageSchema` at
`apps/extension/shared/types/validation.ts:151-156` and
`UpdateSnippetMessageSchema` at
`apps/extension/shared/types/validation.ts:158-164`). Every snippet write goes
through this message path (`apps/extension/background/messages/addSnippet.ts:8-17
(handleAddSnippet)`), so a snippet body between 10,001 and 100,000 characters —
legal per the schema and per `docs/snippets.md` — is rejected at the transport
with `{ error: "Message validation failed: Message too large" }` before the
schema ever sees it. No other schema exceeds the guard: automation strings cap
at 2,000 (`apps/extension/shared/types/automationValidation.ts:35
(USER_SCRIPT_STRING_MAX_LENGTH)`), workflow `injectCss` at exactly 10,000
(`apps/extension/shared/types/workflowValidation.ts:219`, and the guard is
strict `>` so 10,000 passes).

**Why it matters**
This is an active user-facing bug: pasting a long snippet (a code template, an
email boilerplate) silently fails with a generic validation error that points
at nothing. It is also a trap for every future schema author — nothing connects
the per-field Zod `max()` values to the transport constant, so the next
generous field limit will re-introduce the same bug.

**Proposed change**
1. Raise `MAX_STRING_LENGTH` to `100_000` in
   `apps/extension/background/utils/validation.ts:42` (or in `sizeGuards.ts`
   if MSG-06 lands first) with a comment naming the constraint:
   `// Must be >= the largest schema-allowed string field (SnippetBodySchema, 100_000).`
2. Keep `MAX_MESSAGE_SIZE` (1 MB) unchanged — it remains the real memory
   guard.
3. Add a test in `apps/extension/background/utils/validation.test.ts`:
   `validateIncomingMessage` accepts a `monocle-snippet-add` message with a
   50,000-character body and still rejects one with a 150,000-character body
   (schema failure, not transport failure — assert on the error text).

**Do NOT change / risks**
Do not lower `SnippetBodySchema`'s limit instead — 100k is the documented
snippet contract and stored snippets may already exceed 10k (imported via the
options page in dev). Do not exempt specific message types from the guard;
one constant with a stated invariant is simpler than a per-type table.

**Verification**
New test above; existing `validation.test.ts` and
`background/messages/deleteSnippet.test.ts` stay green. Manual: add a >10k
character snippet from the options Snippets page and confirm it saves.

**Related**
MSG-06 (moves the constant), TEST file 41 (rate-limit/size guards have zero
coverage today).

---

### MSG-02: Unify the thrown-handler error shape between Chrome and Firefox

**Priority:** P1     **Effort:** S     **Type:** consistency

**Current state**
`createCrossBrowserMessageHandler`
(`apps/extension/background/utils/runtime.ts:97-142`) resolves handler errors
differently per browser: on Chrome a rejected handler promise is caught and
delivered as `sendResponse({ error: error.message })`
(`apps/extension/background/utils/runtime.ts:129-137`), but on Firefox the raw
promise is returned (`apps/extension/background/utils/runtime.ts:140`), so a
thrown handler error **rejects the sender-side `sendMessage` promise** instead
of resolving to `{ error }`. Eleven handlers deliberately throw through to this
wrapper so callers get specific error text — e.g. `updateCommandSetting`
(`apps/extension/background/messages/updateCommandSetting.ts:37-96`, throws on
invalid URL patterns and disallowed keybindings), `updateCommandKeybindings`
(`apps/extension/background/messages/updateCommandKeybindings.ts:39-72`, throws
for structurally illegal assignments), `getPermissions`
(`apps/extension/background/messages/getPermissions.ts:38-43`), features/
snippets wrappers rethrow via `createMessageHandler` only as generic text. The
documented caller contract is "check `response.error`; a rejected promise only
happens for transport-level `lastError`" (`docs/messaging.md:358`), which
Firefox violates for every throw path.

**Why it matters**
The same user action produces two different failure modes by browser: Chrome
callers see `{ error }` and render it; Firefox callers get an unhandled
promise rejection (UI code following the documented contract has no `catch`),
so the user gets no feedback and the console gets noise. Every new throwing
handler silently inherits the divergence.

**Proposed change**
In `createCrossBrowserMessageHandler`, make the Firefox branch mirror the
Chrome catch:

```ts
if (!isFirefox) { /* unchanged */ }

return responsePromise.catch((error) => {
  console.error("[MessageHandler] Error handling message:", {
    error: error instanceof Error ? error.message : String(error),
    senderContext: senderValidation.context,
    messageType: message?.type || "unknown",
  })
  return { error: error instanceof Error ? error.message : String(error) }
})
```

**Do NOT change / risks**
Do not wrap the throwing handlers in `createMessageHandler` instead — the
generic wrapper text would destroy the specific error messages the options UI
displays (e.g. `Invalid pattern "..." ...`). Before landing, grep UI call
sites for `.catch(`/`try` around `sendMessage` of the eleven throwing message
types to confirm nothing depends on Firefox rejection semantics (none was
found in this review; `sendRuntimeMessage` at
`apps/extension/shared/utils/extension-api.ts:21` only rejects on
`lastError`). Wire success shapes are untouched.

**Verification**
Add a first test file for `runtime.ts`
(`apps/extension/background/utils/runtime.test.ts`): with a mocked Firefox
environment, a handler that throws resolves the listener's returned promise to
`{ error: <message> }`. Manual (Firefox): enter an invalid URL pattern in a
command's allow-list and confirm the error surfaces in the options UI instead
of an unhandled rejection.

**Related**
MSG-08 (documents the wrapped/unwrapped split), file 14 (`executeKeybinding`
has its own try/catch and is unaffected).

---

### MSG-03: Make router dispatch compile-time exhaustive and twin-check the two message unions

**Priority:** P1     **Effort:** S     **Type:** consistency

**Current state**
Adding a message type touches four mandatory points: the request type and
`Message` union (`apps/extension/shared/types/messaging.ts:421-457 (Message)`),
the Zod schema and `MessageSchema` union
(`apps/extension/shared/types/validation.ts:312-348 (MessageSchema)`), the
handler module, and a `.with()` arm in the router
(`apps/extension/background/messages/index.ts:86-194 (handleMessage)`) — plus
optionally `SendableMessage`
(`apps/extension/shared/hooks/useSendMessage.tsx:47-66`) and
`docs/messaging.md`. Two drift gaps exist in that ceremony today:

1. The router ends in `.otherwise(() => { throw new Error("Unknown message
   type: ...") })` (`apps/extension/background/messages/index.ts:192-194`), so
   a schema variant added without a match arm compiles cleanly and only fails
   at runtime.
2. Nothing statically ties `Message` to `ValidatedMessage`
   (`apps/extension/shared/types/validation.ts:455`). The `.with()` arms check
   one direction per handler call, but a variant added to `messaging.ts` and
   forgotten in `validation.ts` (or vice versa) is only caught when someone
   happens to route a value across the gap.

**Why it matters**
The unions and the router enumerate the same 35 types in three places by
design (`docs/messaging.md:390` names this explicitly); the whole safety story
rests on them never drifting. Both failure modes are runtime-only today —
"Unknown message type" for a forgotten arm, and silent Zod key-stripping /
rejection for a forgotten schema — and both land exactly when someone performs
the most common messaging task, adding a message.

**Proposed change**
1. In `apps/extension/background/messages/index.ts`, replace the
   `.otherwise(...)` at lines 192–194 with `.exhaustive()` (ts-pattern ^5.8.0,
   already a dependency — `apps/extension/package.json:49`). The thrown-error
   branch is unreachable anyway: `validateIncomingMessage` rejects unknown
   types before dispatch. Update the file's architecture header (lines 1–6) to
   say the match is exhaustive.
2. In `apps/extension/shared/types/validation.ts`, next to `ValidatedMessage`
   (line 455), add a compile-time twin assertion:

```ts
import type { Message } from "./messaging"

// Compile-time twin check: the hand-written wire contract (Message) and the
// Zod-inferred union (ValidatedMessage) must stay member-for-member
// interchangeable. Adding a variant to only one side fails one of these.
type AssertTrue<T extends true> = T
export type _MessageCoversSchema = AssertTrue<
  [ValidatedMessage] extends [Message] ? true : false
>
export type _SchemaCoversMessage = AssertTrue<
  [Message] extends [ValidatedMessage] ? true : false
>
```

   If `pnpm run tsc` reveals existing drift when this lands, reconcile the
   drifting variant (schema is the runtime truth) rather than loosening the
   assertion.

**Do NOT change / risks**
This is exactly the "reduce ceremony without dynamic dispatch" line the guard
list draws: do **not** replace the match chain with a string-keyed handler
registry. Note the assertion cannot catch a hand-declared *optional field*
missing from a schema (Zod strips it; structural assignability still holds) —
that residual gap is acceptable and not worth `.strict()` schemas (see
Non-findings). Wire behavior is unchanged.

**Verification**
`pnpm run tsc` (the real test: temporarily add a dummy variant to
`MessageSchema` only and confirm both the router and the twin check error).
Full suite stays green; no runtime behavior change.

**Related**
MSG-08 (the "Adding A New Message Type" doc section should mention the
compile-time checks), Non-finding 1 (colocation registry refuted),
`docs/extension-extension/` future type package benefits from a drift-proof
wire contract.

---

### MSG-04: Type the store-side send boundary

**Priority:** P1     **Effort:** M     **Type:** consistency

**Current state**
The UI has two send paths with opposite typing. `useSendMessage` types its
parameter as a hand-maintained `SendableMessage` union with six hand-written
`Omit<..., "context">` aliases
(`apps/extension/shared/hooks/useSendMessage.tsx:28-66 (SendableMessage)`).
The store path is fully untyped: `createPaletteSendMessage` accepts
`(message: any)` (`apps/extension/shared/store/sendMessage.ts:9-21
(createPaletteSendMessage)`) and the thunk extra-argument contract is
`sendMessage: (message: any) => Promise<any>`
(`apps/extension/shared/store/index.ts:13 (ThunkApi)`). Every automation,
feature, surface, snippet, workflow, and settings-catalog message sent from a
slice thunk crosses the boundary uncheck­ed — a typo'd type string or a missing
required field compiles and fails only at runtime validation
(call sites: `apps/extension/options/OptionsApp.tsx:138`,
`apps/extension/newtab/NewTabApp.tsx:162`,
`apps/extension/content/components/ContentCommandPaletteWithState.tsx:15`).

**Why it matters**
The background boundary is the most carefully validated seam in the codebase
(Zod + business checks + rate/size guards), yet the majority sender feeds it
`any`. The compiler already knows every legal message shape
(`shared/types/messaging.ts`); not using that at the send site means wire
mistakes surface as opaque `{ error: "Message validation failed: ..." }`
responses in manual testing instead of red squiggles.

**Proposed change**
1. In `apps/extension/shared/types/messaging.ts`, add next to `Message`:

```ts
// Send-side variant: the transports (useSendMessage, createPaletteSendMessage)
// stamp `context` themselves, so senders provide everything but it.
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never
export type OutboundMessage = DistributiveOmit<Message, "context">
```

2. In `apps/extension/shared/store/sendMessage.ts`, change the returned
   function's signature to
   `(message: OutboundMessage): Promise<unknown>` (keep `extraContext` as-is).
3. In `apps/extension/shared/store/index.ts:13`, change `ThunkApi` to
   `sendMessage: (message: OutboundMessage) => Promise<unknown>`.
4. In `apps/extension/shared/hooks/useSendMessage.tsx`, replace the six
   hand-written `...WithoutContext` aliases (lines 28–45) with
   `DistributiveOmit<X, "context">` applications (or narrow `OutboundMessage`
   by type string), keeping the union's *membership* exactly as it is today —
   the hook deliberately covers only component-sent messages.
5. Fix whatever `pnpm run tsc` flags at thunk call sites. Expect only
   annotation-level fixes; genuine shape mismatches it uncovers are the bugs
   this finding exists to catch. Slice-internal restructuring stays out of
   scope (file 23 owns it) — coordinate if a `STATE` finding rewrites the same
   thunks.

**Do NOT change / risks**
Do not merge the two send paths into one abstraction — the hook adds live
modifier-key tracking the factory must not grow. Response typing
(`Promise<unknown>` vs per-message response types) is deliberately left alone;
a typed request/response map is a bigger design that nothing currently
justifies. Per-slice `sendMessage: (message: unknown) => ...` local types
(e.g. `apps/extension/shared/store/slices/automations.slice.ts:21`) are file
23's territory.

**Verification**
`pnpm run tsc`, full test suite, and a smoke of options-page automations CRUD
plus new-tab background fetch (the two heaviest store senders).

**Related**
File 23 (thunk internals), MSG-03 (both lean on `Message` being trustworthy).

---

### MSG-05: Delete the dead validation/messaging helpers

**Priority:** P2     **Effort:** S     **Type:** dead-code

**Current state**
Four exported helpers on this seam have zero production callers (verified by
repo-wide grep):

- `createValidatedMessageHandler`
  (`apps/extension/background/utils/validation.ts:344-365`) — a per-handler
  validate-then-dispatch wrapper made obsolete by the centralized
  `validateIncomingMessage` in the router.
- `withErrorHandling` (`apps/extension/background/utils/messages.ts:11-23`) —
  unused, and subtly broken: it is an `async` *factory* (callers would have to
  await it to get the handler) and its wrapped handler drops the `sender`
  parameter. `docs/messaging.md:355` presents it as a live alternative.
- `createMessageValidator`
  (`apps/extension/shared/types/validation.ts:431-452`) — per-schema validator
  factory; no handler validates individually anymore.
- `validateBrowserContext`
  (`apps/extension/shared/types/validation.ts:387-408`) — used only by its own
  test (`apps/extension/shared/types/validation.test.ts:13-20`).

**Why it matters**
These read as the sanctioned extension points of the validation layer — a new
engineer adding a handler will plausibly wrap it in
`createValidatedMessageHandler` (double-validating every message) or copy
`withErrorHandling`'s broken shape, because the docs still advertise it.

**Proposed change**
1. Delete the four functions and their now-unused imports
   (`createMessageHandler` import in `validation.ts:14` stays only if still
   used — after this deletion it is not; remove it).
2. Delete the `validateBrowserContext` cases from
   `apps/extension/shared/types/validation.test.ts`.
3. Remove the `withErrorHandling` sentence from `docs/messaging.md:355`
   (subsumed by MSG-08's rewrite of that bullet — land together or order
   MSG-05 first).

**Do NOT change / risks**
Keep `createMessageHandler` and `resolveSenderTabId`
(`apps/extension/background/utils/messages.ts:35-56`) — both heavily used.
Keep `validateMessage` and `formatValidationError` in
`shared/types/validation.ts` — they are the live entry points.

**Verification**
`pnpm run tsc`, `pnpm test` (703 baseline), `pnpm run build`. Grep confirms no
remaining references.

**Related**
MSG-08 (doc bullet), MSG-06 (shrinks the same file further).

---

### MSG-06: Split transport guards out of `utils/validation.ts` and fix the misleading `validateSender` name

**Priority:** P2     **Effort:** S     **Type:** decompose

**Current state**
`apps/extension/background/utils/validation.ts` (380 LOC) interleaves three
concerns: rate limiting (module-state `Map`, constants, `isRateLimited`,
`cleanupValidationData` + a module-load `setInterval` —
`apps/extension/background/utils/validation.ts:33-68` and `:370-380`), size
guards (`apps/extension/background/utils/validation.ts:41-42` and `:75-105
(exceedsMessageLimits)`), and message validation proper
(`validateIncomingMessage` at `:143-196`, `validateBusinessLogic` at
`:211-336`). Worse, the function bundling the first two is named
`validateSender` (`apps/extension/background/utils/validation.ts:113-135`) —
but it performs **no sender-identity validation at all**; actual sender
validation (extension-id check, web-page rejection, suspicious-URL block)
lives in the near-identically named `validateMessageSender` in
`apps/extension/background/utils/runtime.ts:30-90`.

**Why it matters**
Two functions named "validate(Message)Sender" in sibling files, where one
checks identity and the other checks throughput, is a genuine misdirection:
someone auditing sender trust will find `validateSender` first and conclude
the wrong thing. Secondarily, the frequently edited part of the file (the
`validateBusinessLogic` switch grows with new messages) is buried under stable
security plumbing.

**Proposed change**
Byte-identical wire behavior throughout (same error strings, same check
order: rate limit, then size, then schema, then business).

1. New `apps/extension/background/utils/rateLimit.ts`: move
   `validationRateLimit`, `RATE_LIMIT_WINDOW`, `RATE_LIMIT_MAX`,
   `isRateLimited`, `cleanupValidationData`, and the `setInterval` call.
   Export `isRateLimited` and `cleanupValidationData`.
2. New `apps/extension/background/utils/sizeGuards.ts`: move
   `MAX_MESSAGE_SIZE`, `MAX_STRING_LENGTH`, `exceedsMessageLimits`. Export
   `exceedsMessageLimits`.
3. In `validation.ts`, delete `validateSender` (exported but unused outside
   this file) and inline its two checks at the top of
   `validateIncomingMessage`, preserving the exact `senderId` derivation
   (`sender?.id || sender?.url || "unknown"`), the `console.warn` texts, and
   the returned error strings ("Rate limit exceeded", "Message too large").
4. Top-of-file architecture comments on both new files, matching repo
   convention; update `validation.ts`'s header to say it orchestrates the
   guards and owns schema + business validation.

**Do NOT change / risks**
Do not touch `validateMessageSender` in `runtime.ts` (file-14-adjacent
security logic; correct as-is). Do not "fix" the MV3 `setInterval` (see
Non-finding 6). If MSG-01 lands first, the new constant value moves with the
code. `background/utils/validation.test.ts` imports only
`validateIncomingMessage` — it must pass unmodified.

**Verification**
`pnpm run tsc`, `pnpm test` with `validation.test.ts` untouched. Grep: no
remaining `validateSender` references.

**Related**
MSG-01 (same constant), MSG-05 (delete dead code first so it isn't moved).

---

### MSG-07: Stop logging full message payloads on every dispatch

**Priority:** P2     **Effort:** S     **Type:** consistency

**Current state**
`handleMessage` logs every validated message wholesale:
`console.log("Received message", ...)` at
`apps/extension/background/messages/index.ts:71-83`, with a special case that
summarizes only `monocle-workflow-execute`. Payloads include snippet bodies,
command `formValues` (free-text form input), automation drafts, and page
URLs/titles on every message. Separately, validation failures are logged
twice: once inside `validateIncomingMessage` (`console.warn` at
`apps/extension/background/utils/validation.ts:161-166` and `:177-181`, plus
the rate/size warns at `:121` and `:127-130`) and again by the router
(`console.error` at `apps/extension/background/messages/index.ts:53-60`).

**Why it matters**
This is a production log of user-typed content on every palette interaction —
noise that makes the worker console useless for real debugging, and exactly
the kind of data-handling detail store reviewers probe (the
workflow-execute special case shows the leak concern was already half-felt).
The double failure-log makes every validation error look like two.

**Proposed change**
1. Delete the `console.log("Received message", ...)` block
   (`apps/extension/background/messages/index.ts:71-83`) entirely. If dispatch
   tracing is wanted during development, log `message.type` only, gated on
   `import.meta.env.DEV`.
2. Delete the router's duplicate failure log
   (`apps/extension/background/messages/index.ts:53-60`) — every failure path
   already warns with the same fields inside `validation.ts`. Keep the
   returned response shape byte-identical
   (`{ error, validationIssues }`).

**Do NOT change / risks**
Keep the `console.warn`s inside `validation.ts` (single source of failure
logging). Do not remove per-handler `console.error`s — those log real
execution failures, not payloads.

**Verification**
`pnpm test`; manual: open the worker console, run a few commands, confirm no
payload dumps; send a malformed message from the console and confirm exactly
one warning.

**Related**
`docs/store-submission.md` (data-handling scrutiny), MSG-08 (no doc text
promises this log).

---

### MSG-08: Correct four inaccuracies in `docs/messaging.md`

**Priority:** P2     **Effort:** S     **Type:** doc-rewrite

**Current state**
The catalog itself is accurate — all 35 routed types are documented and no
documented type is stale (verified row-by-row against
`apps/extension/background/messages/index.ts:86-194`). Four claims around it
are wrong:

1. `docs/messaging.md:355` says only `getCommands`, `getChildrenCommands`,
   `executeCommand`, `getKeybindingState` use `createMessageHandler` — in fact
   24 of 35 message types are wrapped; and it presents `withErrorHandling` as
   a live alternative (dead and broken, see MSG-05).
2. `docs/messaging.md:391` says only `executeKeybinding` and
   `checkKeybindingConflict` are unwrapped — there are eleven unwrapped
   handlers (`executeKeybinding`, `checkKeybindingConflict`,
   `executeWorkflow`, `requestPermission`, `getUnsplashBackground`,
   `getPermissions`, `openPermissionGrantPage`, `ensureHostPermissionMessage`,
   `showToast`, `updateCommandSetting`, `updateCommandKeybindings`).
3. `docs/messaging.md:182` omits `nativeMessaging` from the `access` object
   (present at `apps/extension/background/messages/getPermissions.ts:31`).
4. `docs/messaging.md:390` says `SendableMessage` omits only
   `GetUnsplashBackgroundMessage` and `SiteSdkSyncMessage` — it also omits
   workflow-execute, batch keybinding updates, and all automation, feature,
   and surface messages (those are sent by store thunks via
   `createPaletteSendMessage`).

**Why it matters**
These are exactly the sentences an engineer consults when deciding how to
shape a new handler's errors or where to register a new sendable message;
today they teach an undersized picture and a dead helper.

**Proposed change**
Replacement text, verbatim:

For `docs/messaging.md:355` (bullet 2 of "Response And Error Shapes"):

> 2. **`createMessageHandler` wrapper** (`background/utils/messages.ts`): handlers wrapped by `createMessageHandler` catch any throw and return `{ error: <customErrorMessage> }` — the static wrapper text, not the thrown error's message (the real error is logged background-side). Most handlers (24 of 35 message types) use this. The eleven exceptions are deliberate: `executeKeybinding`, `checkKeybindingConflict`, `executeWorkflow`, `requestPermission`, and `getUnsplashBackground` return domain-shaped fallbacks, while `getPermissions`, `openPermissionGrantPage`, `ensureHostPermissionMessage`, `showToast`, `updateCommandSetting`, and `updateCommandKeybindings` throw through to the cross-browser wrapper so callers receive the specific `error.message` (e.g. which URL pattern was invalid).

For `docs/messaging.md:391` (Known Issues bullet):

> - Eleven handlers are not wrapped by `createMessageHandler` (see [Response And Error Shapes](#response-and-error-shapes)); the split is deliberate — wrapped handlers return a generic `{ error }`, unwrapped ones surface specific error text or a domain-shaped fallback.

For `docs/messaging.md:182`, extend the permission list:

> ... `tabs`, `tabGroups` (Chrome only), `management`, `nativeMessaging`).

For `docs/messaging.md:390`, replace the `SendableMessage` sentence:

> Note that `useSendMessage`'s `SendableMessage` union is deliberately narrower — it covers only the messages React components send directly, using context-stripped variants for the command/keybinding/search messages. Everything else (workflow execution, batch keybinding updates, and the automation, feature, surface, and Unsplash messages) is sent by store thunks through `createPaletteSendMessage`, and the content-bridge-only `SiteSdkSyncMessage` by `content/siteSdkBridge.ts`.

If MSG-02/MSG-03/MSG-05 land, also: state in "Response And Error Shapes" that
thrown errors resolve to `{ error: error.message }` on **both** browsers;
mention the compile-time twin check and `.exhaustive()` in the Known Issues
bullet about the three parallel enumerations; drop the `withErrorHandling`
sentence.

**Do NOT change / risks**
Do not restructure the doc — it is otherwise accurate and its catalog format
works. Keep the row-per-message table untouched.

**Verification**
Re-run the row-by-row cross-check after edit; `pnpm run fmt:check` (markdown
untouched by biome, but keep line conventions).

**Related**
MSG-02, MSG-03, MSG-05 (each changes a sentence here; land this last).

---

### MSG-09: Dedupe URL-rules value validation between the boundary and the handler

**Priority:** P3     **Effort:** S     **Type:** dedupe

**Current state**
The same loop — iterate `Object.entries` of the urlRules value, require each
field be an array, run `validateUrlPattern` on every pattern — exists twice:
in `validateBusinessLogic`
(`apps/extension/background/utils/validation.ts:264-282`) and as
`validateUrlRulesSetting`
(`apps/extension/background/messages/updateCommandSetting.ts:18-35`). Both run
on every `monocle-command-setting-update` with `setting: "urlRules"`; only
the error text differs (boundary: `Invalid ${field} pattern "..." ...`;
handler: `Invalid pattern "..." ...`).

**Why it matters**
A change to URL-rule semantics (a new field, a new pattern rule) must be made
twice, and the two copies can drift into disagreeing errors — the boundary
would accept what the handler rejects or vice versa.

**Proposed change**
1. Export from `apps/extension/background/utils/urlFilter.ts`:

```ts
export const validateUrlRulesValue = (
  value: Record<string, unknown>,
): { valid: true } | { valid: false; error: string }
```

   with the boundary's richer error text (`Invalid ${field} pattern
   "${pattern}": ${validation}`) and the exact array/undefined checks both
   copies share.
2. `validateBusinessLogic` case `monocle-command-setting-update` (urlRules
   branch) returns the helper's result directly.
3. `updateCommandSetting` replaces `validateUrlRulesSetting` with
   `const result = validateUrlRulesValue(value); if (!result.valid) throw new
   Error(result.error)`. Behavior note: the handler's thrown message gains the
   field name — acceptable; no test asserts the old exact string
   (`updateCommandSetting.test.ts` asserts rejection, not text — confirm
   before landing).

**Do NOT change / risks**
Keep both layers running (boundary + handler) — the handler is also invoked
directly in tests and the boundary check is the injection guard; this finding
removes the *duplication*, not the defense-in-depth. Do not similarly merge
the keybinding canonical checks: the boundary requires already-canonical text
while the handler re-normalizes arbitrary input — different contracts, not a
copy (see Non-finding 8).

**Verification**
`apps/extension/background/messages/updateCommandSetting.test.ts` and
`apps/extension/background/utils/validation.test.ts` stay green (adjust any
exact-string assertion on the handler error); add one case to
`urlFilter.test.ts` for the new helper.

**Related**
MSG-06 (touches the same switch), `docs/url-filtering.md`.

---

## Non-findings (reviewed, justified)

1. **Per-message four-file ceremony / colocated schema+handler registry**
   (seeded hypothesis 1) — verified: adding a message touches
   `shared/types/messaging.ts`, `shared/types/validation.ts`, a handler
   module, and the router arm (plus optionally the send unions and docs). A
   colocation registry that derives the unions from per-module
   `{ type, schema, handler }` records was considered and rejected: the
   hand-written type layer carries response types and load-bearing doc
   comments that `z.infer` derivation would destroy, the ceremony is
   explicitly documented (`docs/messaging.md:378-386`), and MSG-03 closes the
   actual drift risk in ~10 lines.
2. **`automations.ts` holding seven handlers** (seeded hypothesis 4) —
   sensible domain grouping, not inconsistency: it mirrors `features.ts`
   (three handlers) and `surfaces.ts`, shares one import surface and one
   architecture header, and the seven handlers share housekeeping conventions
   (search-index invalidation, keybinding-registry refresh) that would be
   duplicated across seven files.
3. **`executeCommand.ts` vs the keybinding path both reaching
   `executeCommand` in `background/commands`** (seeded hypothesis 5) —
   deliberate shared choke point (`apps/extension/background/messages/executeKeybinding.ts:16`
   imports the same function): permissions, executor dispatch, and usage
   recording live once behind it; the two message handlers are thin adapters.
4. **`getCommands` and `searchCommands` both using `commandsToSuggestions`**
   (seeded hypothesis 5) — shared conversion API with different contracts:
   root empty-state buckets vs ranked top-N with permission-batched grouping
   (`apps/extension/background/messages/searchCommands.ts:47-105
   (entriesToSuggestions)`); merging them would couple the hot search path to
   the empty-state path.
5. **`showToast` as a bare async function instead of a wrapped handler** —
   its direct call shape is load-bearing: command executors and features call
   it as an internal helper (`apps/extension/background/commands/execution.ts:51`,
   `apps/extension/background/features/elementHider/index.ts:100`), and its
   only failure mode is already caught internally.
6. **`setInterval`-based rate-limit cleanup in an MV3 worker**
   (`apps/extension/background/utils/validation.ts:380`) — the interval dies
   on worker suspension, but so does the in-memory map it cleans; entries are
   also lazily reset per-sender in `isRateLimited`. Harmless as-is.
7. **Coarse rate-limit buckets** (all extension pages share one `sender.id`
   key, `apps/extension/background/utils/validation.ts:117`) — the limit is
   an anti-flood guard, not per-tab fairness; 1000/min is far above
   legitimate aggregate traffic.
8. **Keybinding checks appearing twice (boundary + handler)** — not a copy:
   `validateBusinessLogic` rejects non-canonical text at the wire (an
   API-contract guard), while `updateCommandSetting` /
   `updateCommandKeybindings` re-normalize arbitrary input because they are
   also called directly in tests; collapsing them would change one contract
   or the other.
9. **Message schemas not using `.strict()`** — Zod's default key-stripping is
   load-bearing: `createPaletteSendMessage` stamps `context` onto every
   message including the four context-less permission messages, and strict
   schemas would reject them. Stripping is the safer default at this
   boundary.
10. **The 3-way `validation.ts` split as originally hypothesized** (seeded
    hypothesis 2) — partially upheld: the mechanical split is specced in
    MSG-06, but the honest driver is the misleading `validateSender` name;
    the concerns compose into one boundary check and the split alone would be
    marginal. No coupling is load-bearing beyond call order, which MSG-06
    preserves.
