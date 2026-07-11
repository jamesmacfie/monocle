# Review: LLM Generation of Automation JSON

Code review of the OpenAI-backed automation generation feature
(plan `plans/011-generate-automations-with-openai.md`), performed 2026-07-11
against the uncommitted working tree. Scope: everything under
`background/automations/generation/`, `background/messages/automationGeneration.ts`,
`shared/automations/`, the generation/review dialogs, and the message-contract,
validation, and docs changes that support them. All paths relative to
`apps/extension/`.

**Verdict: sound architecture, ship after fixing one confirmed normalizer bug.**
The trust boundaries are right, the layering is clean, and the shared
untrusted-ingress refactor is a genuine improvement to the existing import
path. One real correctness bug was found and reproduced (nested `httpRequest`
bodies lose intentional JSON `null`s); the rest of the findings are risks to
verify manually or minor nits.

## What the implementation gets right

- **The untrusted-data pipeline is layered correctly.** OpenAI's strict
  Structured Outputs schema (`generation/schema.ts`) is the wire contract; a
  defensive Zod envelope (`generation/contract.ts`) proves top-level shape; a
  pure field-aware normalizer (`generation/normalize.ts`) lowers the IR; and
  everything then funnels through `shared/automations/import.ts`
  (`prepareUntrustedAutomation`) — the *same* ingress file import uses — so
  neither path can skip identity stripping, provenance stamping, trigger
  disarming, or the canonical validator. The generated draft is never
  persisted, armed, or run; it lands in the existing capability review dialog
  and only `addAutomation` after explicit confirmation stores it.
- **The import refactor is a net win beyond the feature.** File import
  previously stripped only `id`/`createdAt`/`updatedAt`; the shared ingress now
  also strips `source`/`owner`, and the previously inline review UI in
  `AutomationsPage.tsx` is now one `AutomationReviewDialog` shared by both
  paths (~150 lines of duplicated JSX deleted).
- **Credential handling is background-only and one-directional.** The API key
  crosses UI → background once on set, is stored under its own
  `chrome.storage.local` key, and every response back to any UI carries only
  `{hasApiKey, model}`. The UI states plainly that browser storage is not a
  server-side secret. Length/emptiness are validated at both the message
  schema (`shared/types/validation.ts`) and the settings module.
- **Permission posture is correct.** `https://api.openai.com/*` is covered by
  the existing optional host wildcard, is requested at point of use from the
  dialog, and the background *re-checks* `permissions.contains` (plus the
  Firefox outbound-data consent) before any remote request — browser truth,
  not UI state, gates the call. Requests use `store: false`,
  `credentials: "omit"`, `no-referrer`, and never log prompts, responses, or
  the key.
- **Prompt-injection blast radius is bounded by construction.** Whatever the
  model returns is data through a closed schema; there is no JS step in the
  vocabulary; non-manual triggers arrive force-disarmed; `httpRequest` remains
  consent/permission-gated with static destinations; snippet *bodies* and
  existing automations are never sent (verified by
  `automationGeneration.prompt.test.ts`, which asserts the prompt builder has
  no input through which a snippet body could arrive).
- **Message exposure is scoped as intended.** The five new message types are
  reachable only via the extension's own runtime router. The site-SDK bridge
  relays a fixed set of `monocle-site-sdk-*` types, and external extensions
  speak the separate `ExtRequest` protocol — neither can reach key storage or
  generation.
- **The schema is kept honest by tests.**
  `automationGeneration.schema.test.ts` walks the JSON schema asserting every
  object is closed with all properties required (the strict-mode contract) and
  that every trigger/condition/step discriminator in the canonical Zod
  vocabulary appears in the generation schema — a lockstep guard so a new op
  can't silently go missing from generation.
- **Failure taxonomy is thorough**: distinct typed codes for missing key,
  permission, busy, cancelled, timeout, network, invalid key, forbidden, rate
  limit vs. quota, model unavailable, refusal, incomplete, invalid output, and
  service error, each with a retryable flag and optional `x-request-id` for
  support. HTTP status mapping in `openai.ts` is careful (e.g. 429 quota vs.
  rate limit split).

All 53 tests across the 14 new/touched suites pass
(`vitest run background/automations/generation background/messages/automationGeneration.message.test.ts shared/automations options/pages/automations`).

## Confirmed bug

### Nested `httpRequest` bodies lose intentional JSON `null` (normalize.ts)

`normalizeStep` protects a decoded HTTP body from the trailing
`omitNulls(step)` sweep by re-assigning `decodedHttpBody` afterwards — but only
for the step being processed. Child steps inside `branch.then/else`,
`forEach.steps`, `while.steps`, and inline-surface `actions[].steps` are
normalized first (each correctly protecting its own body), and then the
*parent's* `omitNulls(step)` re-walks the whole subtree and strips the
`{key: null}` entries out of the already-decoded child bodies.

Reproduced: an IR with `branch → then: [httpRequest body {title: "t",
optional: {type:"null"}}]` normalizes to `body: {title: "t"}` — the tagged
`null` the entire `jsonNode` encoding exists to preserve is silently dropped.
This contradicts the stated invariant in the header comments of `schema.ts`,
`normalize.ts`, and the new docs section, and it corrupts rather than rejects,
so it fails silently. The existing test
(`automationGeneration.normalize.test.ts`) only covers a *top-level*
`httpRequest`, which is why it passes.

**Fix direction:** don't re-run `omitNulls` over already-normalized children.
Either (a) apply `omitNulls` to the step's own shallow fields before recursing
into child-step arrays and decoding the body, or (b) make the recursive
cleanup stop at child-step arrays/decoded bodies. Add a regression test with an
`httpRequest` (intentional-null body) nested inside `branch`, `forEach`, and an
inline-surface action.

Severity: low frequency (the model must emit an intentional-null body field
inside nested control flow) but a real correctness/invariant violation, and a
two-line-shaped fix. Fix before merge.

## Risks to verify manually (not code defects)

1. **MV3 service-worker lifetime vs. long generations.** One attempt allows up
   to 120 s; a semantic repair doubles that; the options page awaits a single
   runtime-message response the whole time. Chrome ≥116 extends worker
   lifetime during active fetches and Firefox event pages behave similarly,
   but this is the longest-lived message round-trip in the extension. If the
   worker is reaped mid-flight, the UI promise rejects generically and the
   busy slot is lost with it. The new manual checklist in `docs/automations.md`
   covers error paths but not a *long successful* run — add "generation that
   takes >60 s completes and returns a draft" to the live-key smoke.
2. **Closing the options tab mid-generation orphans the busy slot.** The
   dialog's cancel path aborts correctly, but closing the tab outright leaves
   the in-flight request running (and billing) until completion/timeout, and
   the single global `busy` gate stays held for up to ~2 minutes. Acceptable
   for a single-user feature; if it bites, listen for port disconnect or track
   a start timestamp to allow takeover.
3. **Prompt cost is nontrivial and doubles on repair.** Each request bundles
   the full authoring contract (~25 KB) plus curated examples (~11 KB) —
   roughly 10k input tokens per attempt, and a repair resends everything plus
   the failed draft. Documented ("charges apply") and reasonable for quality;
   just noting the repair path is the expensive one if it ever becomes a loop.

## Observations and accepted trade-offs

- **`docs/automation_context.md` is now shipped code.** `prompt.ts` imports it
  via `?raw` from outside the package boundary, so editing that doc silently
  changes the production prompt (and bundle). This is arguably the *point* —
  one source of truth for manual and LLM authoring, and the prompt test pins
  key invariants — but the doc itself should carry a one-line header warning
  editors that it is bundled into the extension. Also note the repo-root path
  sits outside `apps/extension`, so package-scoped tooling (e.g. Turbo input
  hashing) may not see changes to it.
- **Hardcoded model id** (`gpt-5.6-terra`, no override). Deliberate simplicity;
  if OpenAI retires it, users are stuck until an extension update, but the
  400/404 → `model-unavailable` mapping makes that failure legible. Fine.
- **Generation messages are callable from any extension context** (content
  scripts included), same as `addAutomation` and other sensitive handlers.
  Consistent with the existing trust model (content scripts are extension
  code); no change requested — recorded so a future site-SDK or external
  surface expansion doesn't forward them by accident.
- **`activeGenerations.size > 0 || activeGenerations.has(id)`** — the second
  clause is unreachable given the first. Harmless; drop it when next in the
  file.
- **User-initiated cancel renders as an error.** After "Cancel generation", the
  pending response resolves with code `cancelled` and the dialog shows
  "Generation was cancelled." in the red error banner. Special-case
  `cancelled` to a neutral notice (or nothing).
- **Single `output_text` part assumed.** `openai.ts` fails (`invalid-output`,
  retryable) if the message contains ≠1 text part. Structured outputs normally
  yield exactly one; concatenating parts would be marginally more robust, but
  failing loudly is defensible.
- **Docs are genuinely updated**, not just appended: `docs/automations.md`
  gained a Generate-with-AI section, security-model and store-posture notes,
  and manual checklist items; `docs/messaging.md` and `docs/permissions.md`
  track the new messages/origin. Matches the repo's docs-first contract.

## Suggested follow-ups (priority order)

1. Fix the nested intentional-null bug in `normalize.ts` + regression tests
   (blocker).
2. Add a long-running success case to the live-key manual smoke; confirm
   Chrome and Firefox keep the worker alive across a 120 s+ generation.
3. Add a "this file ships inside the extension as the generation prompt"
   header to `docs/automation_context.md`.
4. Nits when convenient: neutral cancelled-state UI, drop the redundant busy
   clause.
