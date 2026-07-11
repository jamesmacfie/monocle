# Plan 011: Generate reviewed automation drafts with OpenAI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 53603b4..HEAD -- docs/automations.md docs/automation_context.md docs/messaging.md docs/permissions.md docs/store-submission.md apps/extension/options/pages/AutomationsPage.tsx apps/extension/options/pages/automations apps/extension/shared/types apps/extension/shared/utils apps/extension/background/automations apps/extension/background/messages apps/extension/wxt.config.ts`
>
> This plan was written while the working tree already contained the
> maintainer's recursive automation-editor work, including an edit to
> `docs/automations.md`. Preserve it. The generator must compose with that work;
> it must not revert, restyle, or reimplement the editor changes.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `53603b4` plus the uncommitted automation-editor work,
  2026-07-11

## Why this matters

Monocle already has a strict declarative automation language, a curated example
set, an LLM authoring guide, and a safety-focused import review. Generating an
automation should reuse those boundaries: the model produces an untrusted draft,
Monocle normalizes and validates it, automatic triggers are disarmed, and the
user explicitly reviews and imports it. The model must never write directly to
`monocle-automations`, arm triggers, execute a draft, or receive executable
functions.

There is one important product/security constraint. A browser extension cannot
store a recoverable OpenAI API key as a true secret. OpenAI's published guidance
recommends routing requests through a backend rather than deploying keys to
browser clients. This plan implements local BYOK only because that is the stated
product requirement, with an explicit warning and a background-only storage/API
boundary. If Monocle later becomes a hosted multi-user product, replace BYOK with
a Monocle backend and server-side credentials; do not pretend client-side
encryption solves the problem.

## Architectural decision

The flow is:

```text
Automations page modal
  -> direct user-gesture grant for https://api.openai.com/*
  -> typed generation message (request text only)
  -> background reads local API key
  -> background builds developer instructions + strict response schema
  -> OpenAI Responses API (store: false)
  -> strict LLM intermediate representation (IR)
  -> explicit IR-to-AutomationDraft conversion
  -> existing untrusted-import preparation + canonical Zod validation
  -> existing capability review dialog
  -> existing addAutomation thunk only after user confirms
```

Do **not** call OpenAI from React. The options page must never read a saved key,
and `get settings` must return only `hasApiKey` and the configured model label.

Do **not** send existing user automations or snippet bodies to OpenAI. They can
contain literal secrets, authorization headers, request bodies, and private
workflow data. The dynamic context may include saved snippet **names and ids** so
the model can reference them; disclose this in the modal. Use only the curated,
bundled examples as few-shot examples.

## Why an LLM-specific IR is required

OpenAI strict Structured Outputs requires every object to set
`additionalProperties: false` and every declared property to be required
(optional values are represented with `null`). Monocle's canonical document has
dynamic records that cannot be expressed directly under those constraints:

- `vars` is `Record<variableName, AutomationVarDef>`.
- `httpRequest.headers` has user-selected header names.
- `httpRequest.body` is arbitrary bounded JSON.

Therefore, do not blindly convert `AutomationDraftSchema` to JSON Schema and do
not weaken `strict: true`. Define a lossless LLM-facing IR:

- optional fields are required and nullable;
- `vars` becomes `variables: Array<{ name, definition }>`;
- headers become `Array<{ name, value }>`;
- arbitrary JSON becomes a recursive tagged node (`null`, `string`, `number`,
  `boolean`, `array`, `object` with `{key, value}` entries);
- steps and conditions use `$defs`, `$ref`, and nested `anyOf`; the root remains
  an object, never a top-level `anyOf`;
- the root result is `{ note: string, script: LlmAutomationScript }`;
- `source`, `owner`, ids, and timestamps are not fields the model can emit.

Conversion must be field-aware. Never recursively delete all `null` values:
`null` is a valid value inside an HTTP JSON body. Convert nullable optionals and
the tagged JSON body explicitly, then pass the result through the canonical
automation validator.

## Current state

- `apps/extension/options/pages/AutomationsPage.tsx:1-8` owns the list/import
  page. `ImportState` at lines 77-85 is `closed | invalid | review`; file import
  at lines 137-153 ends in `summarizeAutomation`, and the review UI saves only
  after confirmation.
- `apps/extension/options/pages/automations/importExport.ts:61-110` is the
  safety-critical import boundary: parse/unwrap, strip identity, force every
  non-manual trigger disarmed, stamp imported provenance, run
  `validateAutomationDraft`.
- `apps/extension/shared/types/automationValidation.ts:740-848` is canonical.
  Required root fields are `schemaVersion`, `name`, `enabled`, `triggers`, and
  `steps`; all writes ultimately pass `AutomationDraftSchema`.
- `docs/automation_context.md` already documents every trigger, selector,
  content/engine step, condition, interpolation field, enum, limit, failure,
  and five complete examples. It is excellent source material but is currently
  hand-maintained prose, so generation needs drift tests against code.
- `apps/extension/options/pages/automations/examples.ts` is the curated example
  set and `examples.test.ts` proves every example validates.
- CRUD messages live in `apps/extension/background/messages/automations.ts`,
  with static message types in `shared/types/messaging.ts`, Zod message schemas
  in `shared/types/validation.ts`, and routing in
  `background/messages/index.ts`.
- Automations persist independently under `monocle-automations`. The API key
  needs a separate lifecycle and must not live in the automation document,
  command settings, Redux, exports, or sync storage.
- `apps/extension/wxt.config.ts` already declares optional host access for
  `https://*/*` and extension-page `connect-src` includes `https:`. Request only
  `https://api.openai.com/*` at runtime; do not broaden required permissions.
- Firefox already declares optional outbound data categories and the options
  editor demonstrates direct, user-gesture `permissions.request` with
  `data_collection` in `AutomationEditorPage.tsx:184-218`.
- No OpenAI SDK is installed. Use a small native-`fetch` client; adding the SDK
  would enlarge the extension bundle for one endpoint.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `pnpm test -- automationGeneration` | all new generation tests pass |
| Automation tests | `pnpm test -- automations` | all automation tests pass |
| Full tests | `pnpm test` | all tests pass |
| Typecheck | `pnpm run tsc` | exit 0, no errors |
| Format | `pnpm run fmt:check` | exit 0 |
| Chrome build | `pnpm run build` | exit 0; no new manifest/CSP error |
| Firefox build | `pnpm run build:firefox` | exit 0; no new manifest/CSP error |

## Suggested executor toolkit

- Read `docs/automations.md`, `docs/automation_context.md`, `docs/messaging.md`,
  `docs/permissions.md`, and `docs/store-submission.md` before editing.
- Use the `openai-docs` skill if available. Verify the Responses API and strict
  Structured Outputs contract at implementation time; the verified design as
  of planning is `POST /v1/responses` with `text.format.type = json_schema`,
  `strict: true`, and explicit handling for refusals and incomplete responses.

## Scope

**In scope**:

- The five automation/OpenAI documentation files named above.
- `apps/extension/shared/types/messaging.ts`, `validation.ts`, `index.ts`, and
  focused tests.
- A shared untrusted-draft preparation utility and the curated examples move.
- `apps/extension/background/automations/generation/` (new focused modules for
  constants, settings, IR/schema, normalization, prompt, OpenAI client, and
  orchestration).
- `apps/extension/background/messages/automationGeneration.ts` (new) and the
  background router.
- `apps/extension/options/pages/AutomationsPage.tsx` plus focused generator and
  shared review-dialog components/tests under `options/pages/automations/`.

**Out of scope**:

- Changes to the automation language, runtime engine, trigger engine, lowering,
  or `runCommand` policy.
- Arbitrary JavaScript, web browsing, DOM capture, screenshots, or fetching a
  target website during generation.
- Sending existing automations or snippet bodies to OpenAI.
- Auto-saving, auto-running, auto-arming, or bypassing the import review.
- A provider abstraction or support for non-OpenAI models in this first pass.
- A general secrets vault. The API key store is deliberately narrow.
- Reworking the in-flight recursive automation editor.

## Git workflow

- Preserve the dirty automation-editor files. Never reset, stash, or overwrite
  them.
- Suggested branch after the maintainer settles the current work:
  `james/011-openai-automation-generation`.
- Commit in logical units (contract/storage, generator service, UI/review,
  docs/tests). Do not push or open a PR unless instructed.

## Steps

### Step 1: Update the behavioral documentation first

Update `docs/automations.md` with the end-to-end flow, trust boundary, BYOK
warning, prompt contents, strict IR conversion, disarmed review, and manual
Chrome/Firefox checklist. Preserve the current recursive-editor paragraph.

Update:

- `docs/messaging.md` with all new messages and response unions;
- `docs/permissions.md` with the concrete OpenAI origin grant and Firefox data
  consent path;
- `docs/store-submission.md` with the new third-party data disclosure, API-key
  handling, and store-review language;
- `docs/automation_context.md` only where needed so its vocabulary remains the
  human-readable mirror of the runtime generation catalog.

**Verify**: `git diff --check` -> no whitespace errors; the recursive-editor doc
change remains present.

### Step 2: Extract one reusable untrusted-draft boundary and share examples

Move the non-DOM import preparation from
`options/pages/automations/importExport.ts` to a shared pure module such as
`shared/utils/automation-import.ts`:

- accept an already parsed unknown value and an injected `now()`;
- unwrap a standard envelope or accept a bare script;
- strip ids/timestamps;
- force every non-manual trigger to `disarmed: true`;
- stamp `{kind: "imported", importedAt: now()}`;
- validate with `validateAutomationDraft` and return field paths.

Keep JSON text parsing and download DOM work in `importExport.ts`. Preserve
existing file-import behavior with characterization tests.

Move `EXAMPLE_AUTOMATIONS` from the options-only folder to a shared data module
so both the Add Examples button and background prompt builder consume the exact
same values. Move/update `examples.test.ts`; every example must still pass the
canonical validator, and automatic triggers must remain disarmed.

**Verify**: `pnpm test -- examples importExport` -> all pass.

### Step 3: Add a background-only, failure-loud API-key store

Create `background/automations/generation/settings.ts` backed by
`chrome.storage.local` key `monocle-automation-generation-settings` and a
versioned shape such as `{version: 1, apiKey?: string}`.

Required behavior:

- `getStatus()` returns `{hasApiKey, model}` only;
- `getApiKeyForRequest()` is background-only;
- `setApiKey()` trims but does not overfit to a fragile `sk-*` prefix; enforce a
  conservative non-empty/max-length boundary;
- `clearApiKey()` removes it;
- writes throw on failure. Do not use a helper that logs and swallows a failed
  secret write;
- never log the key, return it to UI, put it in Redux, sync it, export it, show
  its suffix, or include it in errors.

Do not add reversible client-side encryption with a key stored beside the
ciphertext. That provides no meaningful boundary. The modal must say the key is
stored locally in the extension profile and is not a secure server-side secret.

**Verify**: settings tests cover missing/set/replace/clear, storage failures, and
prove no public result contains the plaintext key.

### Step 4: Define the strict LLM IR, schema, and explicit converter

Create focused files under `background/automations/generation/` rather than one
large generator file:

- `contract.ts` - TypeScript IR types and closed capability metadata;
- `schema.ts` - the OpenAI JSON Schema object;
- `normalize.ts` - IR to canonical untrusted script;
- `schema.test.ts` and `normalize.test.ts`.

Schema invariants (test them with a recursive schema walker):

- root is an object with `note` and `script`, not `anyOf`;
- every object has `additionalProperties: false`;
- every object's `required` exactly covers its `properties` keys;
- optional values use `anyOf: [valueSchema, {type: "null"}]`;
- recursive steps/conditions/JSON nodes use `$defs` and `$ref`;
- no unsupported `allOf`, `not`, `if/then/else`, `patternProperties`, or schema
  transforms;
- under OpenAI's current limits: <=5000 object properties, <=10 resolved
  nesting levels where applicable, <=120000 total schema-name/enum characters,
  <=1000 enum values;
- all canonical trigger types, step ops, condition kinds, selector strategies,
  operators, colors, icons, modifiers, positions, dispositions, and HTTP methods
  appear in the schema/catalog.

The converter must:

- turn variable/header entry arrays into records while rejecting duplicates;
- recursively decode the tagged JSON node, preserving an intentional JSON
  `null` body value;
- omit nullable optional IR fields in the canonical document;
- never accept/generated `source`, `owner`, ids, or timestamps;
- send its result through the shared untrusted-draft preparation and canonical
  validator;
- return field-level semantic errors (duplicate triggers, invalid regex,
  navigation inside control flow, structural caps, bad endpoint/header, etc.).

**Verify**: `pnpm test -- automationGeneration` -> schema walker and conversion
tests pass, including variables, headers, nested body JSON, branch/loop,
surfaces, and all optional/null cases.

### Step 5: Build a non-duplicative prompt from canonical capabilities

Create `prompt.ts` and tests. The stable developer instructions should contain,
once each:

1. Role and trust boundary: produce one Monocle automation, data only, no JS,
   never arm or execute it.
2. Required document fields and structural caps.
3. Every automation operation with its required/optional fields, allowed enum
   values, what each value means, defaults, interpolation rules, and runtime
   limitations.
4. Selector/condition/variable/template semantics and the `runCommand` policy.
5. All curated examples serialized from the shared example module.
6. Dynamic snippet names/ids only (never bodies). If there are none, say so.
7. A rule not to invent snippet or command ids and not to embed credentials in
   literal vars/headers/bodies; prefer a snippet reference/parameter.
8. A rule to put site-selector assumptions or missing information in `note`.
9. A reminder that the model has no live web/DOM access and cannot verify a
   site's current markup.

Put the static contract/examples first and the user's request last, so repeated
requests retain a stable prefix for prompt caching. Do not repeat the full JSON
schema as prose; the `text.format` schema already carries exact structure.

Use the complete contract, but keep each fact stated once. Add drift tests that
derive canonical enum/op sets from exported tuples or schema metadata and fail
when prompt/catalog coverage falls behind. Do not rely on grep alone.

**Verify**: prompt tests prove every capability value is covered, examples are
included, snippet bodies/existing automations are absent, and the user request
is the final input.

### Step 6: Implement the narrow Responses API client

Create `openai.ts` with injected `fetch`, timer, and abort dependencies for
tests. Use native fetch against `https://api.openai.com/v1/responses`:

```ts
{
  model: DEFAULT_AUTOMATION_GENERATION_MODEL,
  store: false,
  reasoning: { effort: "medium" },
  instructions,
  input: [{ role: "user", content: request }],
  max_output_tokens: /* bounded constant sized for <=100 steps */,
  text: {
    format: {
      type: "json_schema",
      name: "monocle_automation_generation",
      strict: true,
      schema: AUTOMATION_GENERATION_SCHEMA,
    },
  },
}
```

As of planning, OpenAI recommends the Responses API for reasoning models and
`gpt-5.6-terra` as its capability/cost balance. Keep the model in one constant
and expose the label to UI; do not create a provider framework. Before merging,
verify the selected model still supports strict structured output. Add an eval
gate before any future model change; use a documented snapshot when available.

Parse `output` by type; never assume `output[0].content[0]`. Handle:

- `status: incomplete` (`max_output_tokens`, content filter, or unknown reason);
- `refusal` content;
- missing/multiple output-text objects;
- invalid JSON despite the contract;
- request timeout/abort;
- 400, 401, 403, 404/model access, 429, 5xx, and network failures.

Map them to a typed safe error union with `code`, user-facing message,
`retryable`, and optional OpenAI request id. Never surface/log the Authorization
header, request text, generated JSON, raw response body, or secrets. A 401 should
expand the key-change UI; a 429 should distinguish rate limit/quota when the API
provides a safe code; 5xx/network/timeout are retryable.

Allow at most one automatic semantic-repair request. Only repair when the strict
IR parsed but canonical validation failed; send the field-level errors and the
first IR back under the same developer contract. Never retry auth, permission,
refusal, rate-limit, network, timeout, or cancellation automatically.

**Verify**: mocked-fetch tests inspect the outbound body (`store:false`, strict
schema, stable model, no tool/web search), successful parse, repair-once, every
error mapping, request id propagation, timeout, and abort. Assert that captured
logs/errors do not contain fixture secrets.

### Step 7: Add typed messages, background permission checks, and cancellation

Add these message families to `messaging.ts`, `validation.ts`, the `Message`
union, runtime validation union, `docs/messaging.md`, and router:

- `monocle-automation-generation-settings-get`;
- `monocle-automation-generation-key-set`;
- `monocle-automation-generation-key-clear`;
- `monocle-automation-generate` with `{generationId, request}`;
- `monocle-automation-generation-cancel` with `{generationId}`.

Cap request length (recommended 10,000 characters), key length, and generation-id
length at the message boundary. Ensure validation failures do not log the raw key
message.

The handler must recheck `permissions.contains({origins:
["https://api.openai.com/*"]})` and Firefox outbound-data consent before reading
the key or starting fetch. UI permission state is convenience only.

Maintain a module-scoped `Map<generationId, AbortController>` with a global
concurrency limit of one. Reject duplicate/busy ids, remove entries in `finally`,
and let cancel abort the matching request. The service returns a validated draft
and note only; it does not call automation storage.

**Verify**: message validation/router/handler tests cover key absence, permission
denial/revocation, Firefox consent, busy, cancel, cleanup after success/error,
and prove no generation path calls `addAutomation`.

### Step 8: Extract and reuse the capability review dialog

Extract the existing review rendering from `AutomationsPage.tsx` into a focused
`AutomationReviewDialog`/content component that accepts:

- `draft`, `summary`, source label (`file` or `AI generated`), optional model
  note, snippet-label resolver, busy/error state, confirm/cancel/back callbacks.

Keep all current review sections: scope, triggers, action classes, snippets,
opened URLs, runCommand targets, inline actions, outbound destinations/header
names, clipboard, and automatic-trigger warning. AI-generated drafts receive the
same imported provenance and disarmed posture as file imports.

Improve the existing confirmation path while extracting it: await
`dispatch(addAutomation(...))`, close only on fulfilled, and show the returned
error on rejection. Apply this behavior to file import and AI generation so a
failed storage write never looks successful.

**Verify**: focused review/import component tests preserve every existing review
section and cover add success/rejection.

### Step 9: Add the Generate with AI modal to the Automations page

Add a secondary `Generate with AI` button near New Automation/Import. Implement
the modal in `options/pages/automations/GenerateAutomationDialog.tsx`, not as
another several-hundred-line block inside `AutomationsPage.tsx`.

UX states:

1. **First use / no key**: API-key password input, Save and continue, link to
   OpenAI's key page, local-storage warning, and charges/data disclosure.
2. **Key saved**: `API key saved on this device`, with Change and Remove. Never
   prefill or reveal it; replacement means entering a new key.
3. **Compose**: textarea with useful example requests, character count, model
   label, and disclosure that request + schema + curated examples + snippet
   names/ids go to OpenAI (not snippet bodies/existing automations).
4. **Generating**: spinner, `Generating and validating…`, disabled mutation
   controls, and a Cancel generation button. Closing while active sends cancel.
   Streaming is not needed because strict structured output is atomic.
5. **Error**: actionable inline error, prompt retained, retry when safe. Auth
   errors expand Change key; permission denial offers Try again from a fresh
   user gesture.
6. **Review**: reuse the capability review; show non-empty model assumptions;
   allow Back to prompt or Add Automation.

On Generate click, request `https://api.openai.com/*` directly from the options
page's user gesture. On Firefox include the existing outbound
`data_collection` categories. Re-read permission truth after request; if denied,
do not send the generation message. The background still rechecks.

Copy must state that generated selectors may be stale because Monocle does not
browse or inspect the target site during generation, and users should import,
open the editor, and Test on Active Tab before relying on it.

**Verify**: jsdom tests cover first-run save, saved/change/remove key, prompt
validation, denied origin/data permission, spinner/cancel, success-to-review,
auth/rate/network errors, back/retry, and explicit-confirm-only add.

### Step 10: Add regression, evaluation, privacy, and build gates

Add representative prompt fixtures (not live API calls) for at least:

- manual parameter + navigation;
- site-scoped page interaction;
- element trigger with branch;
- HTTP request with headers/body and branching on mapped response variables;
- nested forEach/while;
- inline surface action;
- snippet reference;
- impossible request requiring assumptions/no arbitrary JS.

For live manual evaluation, use a personal low-risk key and test fixture pages;
never commit keys or captured response bodies. Record model/version and whether
the generated draft validated first pass, after repair, or failed.

Update store/privacy docs. Confirm:

- API key/request/output never enter telemetry or console logs;
- `store:false` is present;
- local key is not included in settings export/reset unless explicitly intended;
- Firefox disclosure covers authentication info and user-entered website/data
  content sent to OpenAI;
- Chrome/Firefox optional origin prompts are understandable;
- background bundle growth is reviewed (schema/context/examples are sizable).

Run all commands in the Commands table and manual Chrome/Firefox checks:

- no key, valid key, invalid/revoked key;
- origin/data-consent grant, denial, revocation;
- offline, 429, timeout/cancel;
- generated automatic triggers visibly disarmed;
- outbound destinations/headers shown in review;
- Add Automation only after confirmation;
- generated draft opens and Test on Active Tab works;
- key remains hidden/changeable after options-page reload.

## Test plan

New focused test groups should live beside their modules:

- shared untrusted import + examples;
- generation settings storage;
- strict schema walker and IR normalization;
- prompt coverage/drift;
- mocked Responses API client;
- generation orchestration/messages/cancellation;
- Generate dialog and shared capability review.

No live OpenAI request belongs in `pnpm test`. The test suite must be fully
offline and deterministic. Manual eval results belong in docs/notes without
prompts or outputs containing secrets.

## Done criteria

- [ ] The generator button/modal works on the Automations list page.
- [ ] Saved API key is background-only, local-only, hidden, replaceable, and
  removable; no UI response returns it.
- [ ] OpenAI calls use Responses API, strict `text.format` JSON Schema,
  `store:false`, a centralized model constant, and a concrete optional origin
  grant.
- [ ] Strict IR losslessly supports dynamic vars, headers, arbitrary JSON bodies,
  nested steps/conditions, and all canonical tool/enum values.
- [ ] Generated output passes the same untrusted preparation and canonical Zod
  validation as file import; semantic repair is bounded to one attempt.
- [ ] Automatic triggers are disarmed and no draft is stored until capability
  review confirmation.
- [ ] Existing user automations and snippet bodies are never sent to OpenAI.
- [ ] All error categories above are handled without secret/raw-payload logging.
- [ ] Cancellation aborts fetch and clears the in-flight registry.
- [ ] `pnpm run tsc`, `pnpm run fmt:check`, `pnpm test`, Chrome build, and
  Firefox build all exit 0.
- [ ] Manual Chrome and Firefox checklist is recorded in `docs/automations.md`.
- [ ] No unrelated dirty automation-editor work was reverted or overwritten.
- [ ] `plans/README.md` marks plan 011 DONE (or BLOCKED with reason).

## STOP conditions

Stop and report instead of improvising if:

- OpenAI no longer supports strict Structured Outputs for the selected model or
  rejects the IR schema under current limits.
- A faithful IR requires weakening `strict: true`, accepting arbitrary unknown
  keys, or putting the canonical validator after storage.
- Browser permission policy prevents a direct user-gesture grant for the
  concrete OpenAI origin in either supported browser.
- Completion requires sending existing automation contents or snippet bodies
  without a new explicit user opt-in.
- The saved key would need to cross into content scripts, Redux, page DOM, logs,
  exports, or sync storage.
- The feature requires auto-saving/running/arming model output.
- The in-flight recursive editor has drifted so far that the shared review/import
  extraction would overwrite or duplicate it.
- A focused verification fails twice after a reasonable correction.

## Maintenance notes

- Treat prompt + schema + converter + canonical validator as one lockstep
  contract. Any new automation op/trigger/enum must update all four and the drift
  tests in the same change.
- Model changes are product changes. Run the representative eval set before
  updating the centralized model constant; prefer a pinned documented snapshot
  once available.
- Reviewers should scrutinize dynamic-map conversion, preservation of JSON null,
  secret logging, permission rechecks, refusal/incomplete parsing, and the
  explicit confirmation boundary.
- If prompt cost becomes material, measure before pruning. Keep a stable static
  prefix and remove duplication first; never omit capability constraints that
  prevent invalid or unsafe drafts.
- A future backend should replace local BYOK cleanly behind the background
  generation service. Do not spread provider/auth concerns into React.
