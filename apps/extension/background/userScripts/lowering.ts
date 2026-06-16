// Architecture: background layer. The single place the user-script ->
// workflow mapping lives: classifies steps as content vs engine ops and
// lowers content steps onto the workflow vocabulary
// (shared/types/workflow.ts) the executor implements. Keeping the mapping
// in one module makes the schema-matches-executor corollary checkable in
// one spot: a script that validates must never lower to a workflow the
// executor rejects (see lowering.test.ts). Interpolation happens here —
// content receives already-expanded strings — and hide/injectCss steps are
// scoped to the script id so page edits stay grouped and reversible.
import type { UserScriptEngineStep, UserScriptStep } from "../../shared/types"
import type { Selector, Step } from "../../shared/types/workflow"
import {
  interpolateField,
  type UserScriptPageContext,
  type UserScriptValueBag,
} from "./interpolate"

const ENGINE_OPS = new Set([
  "setVariable",
  "insertSnippet",
  "toast",
  "navigate",
  "openUrl",
  "clipboardWrite",
  "runCommand",
  "showSurface",
  "hideSurface",
  "branch",
  "forEach",
  "while",
])

/** True for steps the background engine executes between content segments. */
export const isEngineStep = (
  step: UserScriptStep,
): step is UserScriptEngineStep => ENGINE_OPS.has(step.op)

/**
 * True when a content step must end its segment after executing: getText
 * writes runtime vars, and later steps' templates can only see those values
 * if the engine re-interpolates from the returned var bag.
 */
export const endsSegment = (step: UserScriptStep): boolean =>
  step.op === "getText"

/**
 * Lowers one content step to its workflow form: interpolates the step's
 * template fields against the current value bag and stamps the script's
 * scope key onto page-edit steps. Engine steps never reach here.
 */
export const lowerContentStep = (
  step: UserScriptStep,
  scriptId: string,
  values: UserScriptValueBag,
  pageContext: UserScriptPageContext,
): Step => {
  if (isEngineStep(step)) {
    throw new Error(`Engine step ${step.op} cannot lower to a workflow step`)
  }

  switch (step.op) {
    case "fill":
      return {
        ...step,
        text: interpolateField(step.text, values, pageContext),
      }
    case "hideElement":
    case "injectCss":
      return { ...step, scopeKey: `userscript-${scriptId}` }
    default:
      return { ...step }
  }
}

const normalizeSelector = (selector: Selector): Selector => {
  if (selector.strategy === "css") {
    return { strategy: "css", value: selector.value }
  }
  return {
    strategy: "text",
    value: selector.value,
    ...(selector.exact !== undefined ? { exact: selector.exact } : {}),
    ...(selector.within ? { within: normalizeSelector(selector.within) } : {}),
  }
}

/** Structural selector equality, ignoring `index` (the loop pins it). */
export const selectorsEquivalent = (a: Selector, b: Selector): boolean =>
  JSON.stringify(normalizeSelector(a)) === JSON.stringify(normalizeSelector(b))

/**
 * Rewrites a step's selectors for one forEach-over-elements iteration: any
 * selector structurally equal to the loop selector (including `within`
 * scopes) is pinned to the current match index. This is how body steps act
 * on "the current item" without selector templating.
 */
export const retargetForLoopIteration = <T extends UserScriptStep>(
  step: T,
  loopSelector: Selector,
  index: number,
): T => {
  const pin = (selector: Selector): Selector => {
    if (selectorsEquivalent(selector, loopSelector)) {
      return { ...selector, index }
    }
    if (selector.strategy === "text" && selector.within) {
      return { ...selector, within: pin(selector.within) }
    }
    return selector
  }

  const clone: any = { ...step }
  if ("target" in clone && clone.target) {
    clone.target = pin(clone.target)
  }
  if ("from" in clone && clone.from) {
    clone.from = pin(clone.from)
  }
  return clone as T
}
