# Selector-Anchored Automation UI

> **Status: implemented on 2026-07-11; manual Chrome/Firefox SPA smoke remains.**
> This is the shipped Phase 1 contract and its acceptance checklist.

## Goal

Allow an Automation to create a small Monocle-owned button group beside a
CSS-selected element and run a fixed list of Automation steps when a user
clicks a button.

This is a Surfaces extension, not general DOM injection. Content receives only
renderable data and action identifiers. It never receives executable Automation
steps.

## Public contracts

The canonical surface schema gains these render-only values:

```ts
type InlinePlacement = {
  selector: string
  index?: number
  position: "before" | "prepend" | "append" | "after"
}

type SurfaceActionDescriptor = {
  id: string
  label: string
  icon?: IconName
  style?: "default" | "primary" | "danger"
}

type Surface = {
  // existing fields
  kind: "overlay" | "badge" | "modal" | "picker" | "inline"
  placement?: InlinePlacement
  actions?: SurfaceActionDescriptor[]
}
```

Automation documents add execution steps to the same action descriptor, but
those steps are stripped before the surface enters `monocle-surfaces`:

```ts
type AutomationSurfaceAction = SurfaceActionDescriptor & {
  steps: AutomationStep[]
}

type ShowInlineSurfaceStep = EngineStepBase & {
  op: "showSurface"
  surfaceId: string
  kind: "inline"
  urlMatch?: SurfaceUrlMatch
  placement: InlinePlacement
  content: AutomationSurfaceContent
  actions: AutomationSurfaceAction[]
}
```

The existing overlay/badge shape remains valid. `placement` and `actions` are
required only for `kind: "inline"`; they are rejected on automation-owned
overlay/badge surfaces. Inline surfaces do not accept `blocking`, `blocks`,
picker `css`, or arbitrary attributes.

### Validation caps

| Field | Rule |
| --- | --- |
| `placement.selector` | static non-empty string, maximum 2,000 characters |
| `placement.index` | integer 0–1,000; default 0 |
| `placement.position` | exactly `before`, `prepend`, `append`, or `after` |
| `actions` | 1–5 entries |
| action id | current Automation variable-name grammar, maximum 100 characters; unique within the surface |
| action label | 1–100 characters |
| action icon | existing Lucide `IconName` catalogue only |
| action steps | non-empty; included in the existing 100-document-step and depth-3 caps |

No selector, position, action id, label, icon, or style is interpolatable.
Surface `content.title` and `content.text` retain their existing interpolation.

The document remains `schemaVersion: 1`; this is an additive union member and
old documents retain identical meaning.

## Stored projection

When `showSurface` runs, the engine calls `upsertSurface` with:

- id, kind, URL rules, placement, content; and
- action id, label, icon, and style.

It deliberately omits every action's `steps`. On a click, the background
re-reads the Automation and resolves the action from the source document.

This preserves the existing ownership rule: the background owns behavior;
content renders data and reports gestures.

Inline surfaces are URL-global rather than tab-bound. Once created, the same
surface appears in each tab admitted by its `urlMatch`. The click always runs
against the tab that sent the gesture. A surface that must be scoped narrowly
uses its own `urlMatch`; adding per-tab surface identity is outside v1.

## Content renderer

Add a focused `InlineSurface` component under `content/surfaces/` and keep
`shared/components/SurfaceHost.tsx` as the query/orchestration layer.

For each visible inline surface:

1. Resolve `document.querySelectorAll(placement.selector)[index ?? 0]` in the
   top-frame document. Catch selector syntax errors and render nothing.
2. Create a uniquely marked host element. Apply only containment/layout styles
   to that host; do not inherit page classes.
3. Insert it relative to the anchor:
   - `before` → before the anchor;
   - `prepend` → first child of the anchor;
   - `append` → last child of the anchor;
   - `after` → after the anchor.
4. Attach a **closed** shadow root and render fixed inline styles, optional
   content, and the action buttons into it.
5. Stop action-button pointer/click propagation before reporting the gesture so
   page handlers do not also treat the click as a site action.

The page can still remove the host element because it owns the surrounding DOM.
The security guarantee is isolation of the rendered control, not
unremovability.

### Late and replaced targets

The component owns one `MutationObserver` per rendered inline surface. Observer
callbacks schedule one `requestAnimationFrame` reconciliation rather than
querying repeatedly for every mutation.

Reconciliation must:

- do nothing while the current host is still connected at the correct anchor;
- remove an orphaned/incorrect host before remounting;
- wait indefinitely while no target exists;
- remount when GitHub or another SPA replaces the anchor; and
- disconnect the observer and remove the host when the surface disappears,
  changes, or unmounts.

Ignore mutations within the extension host to avoid an observer loop. The
existing SPA refresh remains useful for changed URLs; the observer handles
same-URL component rerenders.

The content root must mount `SurfaceHost` with `inline` included. The new-tab
host must not render inline surfaces.

## Button interaction flow

```text
user click in closed inline shadow root
  -> monocle-surface-action { ownerId, surfaceId, actionId }
  -> background verifies sender tab + URL
  -> background verifies returned Surface contains that action for sender
  -> parse automation:<automationId>
  -> re-read + validate Automation
  -> locate showSurface(surfaceId).actions[actionId]
  -> run only that action's steps in sender tab
  -> return AutomationRunResult
  -> button re-enables; failures always toast, while success toasts are opt-in
```

Content sends no URL, steps, payload, or destination. Sender tab and URL come
from the browser-provided `MessageSender`.

Before routing an Automation action, the handler calls
`getSurfacesForUrl(senderUrl, senderTabId)` and requires a matching owner,
surface, and action id. It also rejects missing sender tab ids and non-top-frame
senders. This prevents a forged extension message from naming an Automation
action that is not actually visible in that context.

Feature and command routing retain their existing behavior. Put automation
routing behind the explicit `automation:` prefix before the feature fallback.

## Fresh action-run semantics

Add a dedicated engine entry point rather than replaying `script.steps`:

```ts
runAutomationSurfaceAction({
  automationId,
  surfaceId,
  actionId,
  tabId,
  context,
})
```

It shares the document re-read, structural validation, per-script/per-tab
`runningRuns` guard, step counter, result shape, and toast behavior with
`runAutomation`. Extract those common operations rather than duplicating the
engine.

Action runs behave as user-initiated manual runs for `runCommandPolicy`, but
`hostPermissionRequestsAllowed` is `false`. A click deep inside a runtime
message round-trip is not a reliable place to request browser permissions, and
an action should not surprise the user with a second capability prompt.

The value bag is rebuilt from the current document:

- literal variables load again;
- snippet variables and inline snippet references resolve again;
- runtime variables begin as empty strings;
- prior `getText` and loop values are not retained;
- the sender tab supplies current `{url}`/`{title}` page context; and
- the trigger namespace contains:
  - `trigger.type = "surfaceAction"`;
  - `trigger.url` plus the existing URL-part accessors;
  - `trigger.surfaceId`;
  - `trigger.actionId`.

An action needing page data performs its own `getText` before the outbound step.
No value snapshot is stored in `monocle-surfaces`.

## Structural and introspection changes

Treat each action's `steps` as a new root-level child list:

- count them in `collectStructuralIssues`;
- apply normal depth/navigation rules inside the action body;
- visit them in `walkAutomationSteps`;
- scan them for interpolatable values and inline snippet references;
- include them in `automationTouchesPage`;
- include them in import summaries and list blurbs; and
- include `surfaceId/actionId` in step-outcome context without echoing payloads.

An action body is an entry point, not a control-flow level by itself. A branch
inside it raises depth by one exactly as a top-level branch does.

## Builder behavior

Build on the in-progress exhaustive step registry already present in the
working tree.

Add a focused `InlineSurfaceStepEditor` rather than expanding the central
`StepRow` switch with all fields. It edits:

- surface id;
- URL rules;
- CSS selector, index, and position;
- optional icon/title/text; and
- 1–5 buttons with id, label, icon, style, and a validated JSON step-list
  textarea.

The action step-list editor uses `z.array(AutomationStepSchema).min(1)` and the
same “last valid parsed value” behavior as current JSON rows. It must not invent
a second permissive parser.

## Failure behavior

| Condition | Behavior |
| --- | --- |
| Invalid CSS syntax | Render nothing; one development-only diagnostic; do not break other surfaces. |
| Target absent | Keep observing; do not toast repeatedly. |
| Target replaced | Remove stale host and remount at the new match. |
| Unknown/hidden action | Return `{ success: false }`; do not execute. |
| Automation deleted/disabled | Return a normal failed Automation result. |
| Action already running in tab | Reject through the existing concurrency guard; do not queue. |
| Required page/endpoint grant missing | Fail with an Automation toast directing the user to Automations settings. |
| Surface hidden during action | Allow the in-flight action to finish; cleanup is independent of engine execution. |

## Acceptance tests

Automated coverage must include schema caps, action-step traversal, invalid
selector handling, every placement mode, late target appearance, anchor
replacement, unmount cleanup, button pending state, sender verification,
unknown action rejection, fresh values, nested step execution, concurrency,
and unchanged command/feature action routing.

Manual Chrome and Firefox checks must use a GitHub SPA route and two matching
tabs. The button must appear in both, execute in the clicked tab, survive a
same-URL anchor replacement, and disappear when `hideSurface` runs or the URL no
longer matches.
