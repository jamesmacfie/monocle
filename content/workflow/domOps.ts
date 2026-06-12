// Architecture: content layer. DOM read/cleanup workflow operations —
// getText (extraction into workflow vars), removeElement, hideElement, and
// injectCss. One of the workflow executor's op modules (dispatch table in
// content/workflow/executor.ts). Hide/CSS injection share one
// <style data-monocle-style="scopeKey"> element per scope so a user script's
// page edits are grouped, idempotent, and reversible by removing that
// element; removeElement is the destructive alternative (pages may
// re-render removed nodes back).
import type {
  GetTextStep,
  HideElementStep,
  InjectCssStep,
  RemoveElementStep,
  StepResult,
} from "../../shared/types/workflow"
import { findElement, findElements } from "./dom"

const STYLE_SCOPE_ATTRIBUTE = "data-monocle-style"
const HIDE_ATTRIBUTE = "data-monocle-hidden"
const DEFAULT_SCOPE_KEY = "workflow"

// Monotonic suffix so each hideElement step gets a distinct marker value
// within one page lifetime (re-runs re-mark the same elements idempotently
// only when they still carry the attribute).
let hideMarkerCounter = 0

/**
 * Reads text or an attribute from an element into the workflow var bag via
 * the provided sink. `attr` defaults to textContent; "value" reads the
 * element's live value property (inputs); anything else is getAttribute.
 * Extracted values are intentionally not logged — they may hold credentials.
 */
export const executeGetText = async (
  step: GetTextStep,
  setVar: (name: string, value: string) => void,
): Promise<StepResult> => {
  const element = await findElement(step.from, { includeHiddenText: true })
  if (!element) {
    return {
      success: false,
      error: `Could not find element for selector: ${JSON.stringify(step.from)}`,
    }
  }

  const attr = step.attr ?? "textContent"
  let value: string

  if (attr === "textContent") {
    value = element.textContent?.trim() ?? ""
  } else if (attr === "value") {
    value = String((element as HTMLInputElement).value ?? "")
  } else {
    value = element.getAttribute(attr) ?? ""
  }

  setVar(step.toVar, value)
  return { success: true }
}

/** Removes the matching element(s) from the DOM. */
export const executeRemoveElement = async (
  step: RemoveElementStep,
): Promise<StepResult> => {
  const elements = await resolveTargets(step.target, step.all)
  if (elements.length === 0) {
    return {
      success: false,
      error: `Could not find element for selector: ${JSON.stringify(step.target)}`,
    }
  }

  for (const element of elements) {
    element.remove()
  }

  return { success: true }
}

/**
 * Hides the matching element(s) with an injected `display: none !important`
 * rule keyed by a marker attribute, grouped under the step's scopeKey style
 * element. Reversible: removing the scope's <style> restores the page.
 */
export const executeHideElement = async (
  step: HideElementStep,
): Promise<StepResult> => {
  const elements = await resolveTargets(step.target, step.all)
  if (elements.length === 0) {
    return {
      success: false,
      error: `Could not find element for selector: ${JSON.stringify(step.target)}`,
    }
  }

  hideMarkerCounter += 1
  const marker = `${step.scopeKey ?? DEFAULT_SCOPE_KEY}-${hideMarkerCounter}`

  for (const element of elements) {
    element.setAttribute(HIDE_ATTRIBUTE, marker)
  }

  appendScopedCss(
    step.scopeKey,
    `[${HIDE_ATTRIBUTE}="${marker}"] { display: none !important; }`,
  )

  return { success: true }
}

/** Appends CSS to the scope's <style> element (creating it on first use). */
export const executeInjectCss = async (
  step: InjectCssStep,
): Promise<StepResult> => {
  appendScopedCss(step.scopeKey, step.css)
  return { success: true }
}

const resolveTargets = async (
  target: RemoveElementStep["target"],
  all?: boolean,
): Promise<Element[]> => {
  if (all) {
    return await findElements(target, { includeHiddenText: true })
  }

  const element = await findElement(target, { includeHiddenText: true })
  return element ? [element] : []
}

const appendScopedCss = (scopeKey: string | undefined, css: string): void => {
  const scope = scopeKey ?? DEFAULT_SCOPE_KEY
  const head = document.head ?? document.documentElement

  let styleElement = head?.querySelector(
    `style[${STYLE_SCOPE_ATTRIBUTE}="${scope}"]`,
  ) as HTMLStyleElement | null

  if (!styleElement) {
    styleElement = document.createElement("style") as HTMLStyleElement
    styleElement.setAttribute(STYLE_SCOPE_ATTRIBUTE, scope)
    head?.appendChild(styleElement)
  }

  styleElement.textContent = `${styleElement.textContent ?? ""}\n${css}`
}
