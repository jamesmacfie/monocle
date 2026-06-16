// Architecture: content layer. Form-manipulation workflow operations —
// fill, type, key, select, check/uncheck, and submit. One of the workflow
// executor's op modules (dispatch table in content/workflow/executor.ts).
// Values are set through prototype setters and followed by input/change
// events so framework-controlled fields (React/Vue) observe the change; the
// known limitation is exotic editors that reject programmatic value setting,
// which is what the lower-fidelity `type` op exists for.
import type {
  CheckStep,
  FillStep,
  KeyComboStep,
  SelectStep,
  StepResult,
  SubmitStep,
  TypeStep,
  UncheckStep,
} from "../../shared/types/workflow"
import {
  applyTargeting,
  dispatchKeyEvent,
  dispatchSimpleEvent,
  findElement,
  getTagName,
  isValueInput,
  setNativeValue,
  sleep,
} from "./dom"

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"])

const missingElementResult = (target: unknown): StepResult => ({
  success: false,
  error: `Could not find element for selector: ${JSON.stringify(target)}`,
})

/**
 * Sets an input/textarea/contenteditable value. `clear: "select-all"`
 * (default) and `"backspace"` replace the current value; `"none"` appends.
 * Fires input/change events per the step's `fire` flags (default both).
 */
export const executeFill = async (step: FillStep): Promise<StepResult> => {
  const element = await findElement(step.target)
  if (!element) {
    return missingElementResult(step.target)
  }

  await applyTargeting(element, step.targeting)

  const append = step.clear === "none"

  if (isValueInput(element)) {
    const current = (element as HTMLInputElement).value ?? ""
    setNativeValue(element, append ? current + step.text : step.text)
  } else if ((element as HTMLElement).isContentEditable) {
    const htmlElement = element as HTMLElement
    htmlElement.textContent = append
      ? (htmlElement.textContent ?? "") + step.text
      : step.text
  } else {
    return {
      success: false,
      error: "Fill target is not an input, textarea, or editable element",
    }
  }

  if (step.fire?.input !== false) {
    dispatchSimpleEvent(element, "input")
  }
  if (step.fire?.change !== false) {
    dispatchSimpleEvent(element, "change")
  }

  return { success: true }
}

/**
 * Dispatches synthetic keystrokes at the target. Entries that name a single
 * key ("Enter", "Backspace", "a") fire key events; longer strings are typed
 * character-by-character with key events plus value appends. Synthetic key
 * events are inherently lower fidelity than fill — preferred only when a
 * page ignores programmatic value setting.
 */
export const executeType = async (step: TypeStep): Promise<StepResult> => {
  const element = await findElement(step.target)
  if (!element) {
    return missingElementResult(step.target)
  }

  await applyTargeting(element, step.targeting)

  const htmlElement = element as HTMLElement
  if (typeof htmlElement.focus === "function") {
    htmlElement.focus()
  }

  for (const entry of step.keys) {
    if (isSingleKeyName(entry)) {
      dispatchKeyEvent(element, "keydown", { key: entry })
      applyEditingKey(element, entry)
      dispatchKeyEvent(element, "keyup", { key: entry })
    } else {
      for (const char of entry) {
        dispatchKeyEvent(element, "keydown", { key: char })
        dispatchKeyEvent(element, "keypress", { key: char })
        appendText(element, char)
        dispatchSimpleEvent(element, "input")
        dispatchKeyEvent(element, "keyup", { key: char })

        if (step.delayMs) {
          await sleep(step.delayMs)
        }
      }
      continue
    }

    if (step.delayMs) {
      await sleep(step.delayMs)
    }
  }

  dispatchSimpleEvent(element, "change")
  return { success: true }
}

/**
 * Sends a key combination to the focused element (or document body when
 * nothing holds focus). Modifier names accumulate onto the final
 * non-modifier key: ["Control","A"] dispatches "a" with ctrlKey set.
 */
export const executeKeyCombo = async (
  step: KeyComboStep,
): Promise<StepResult> => {
  const element = (document.activeElement ?? document.body) as Element | null
  if (!element) {
    return { success: false, error: "No element available to receive keys" }
  }

  const modifiers = {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  }

  for (const key of step.keys) {
    if (MODIFIER_KEYS.has(key)) {
      modifiers.altKey ||= key === "Alt"
      modifiers.ctrlKey ||= key === "Control"
      modifiers.metaKey ||= key === "Meta"
      modifiers.shiftKey ||= key === "Shift"
      dispatchKeyEvent(element, "keydown", { key, ...modifiers })
      continue
    }

    dispatchKeyEvent(element, "keydown", { key, ...modifiers })
    dispatchKeyEvent(element, "keyup", { key, ...modifiers })

    if (step.delayMs) {
      await sleep(step.delayMs)
    }
  }

  // Release modifiers in reverse order.
  for (const key of [...step.keys].reverse()) {
    if (MODIFIER_KEYS.has(key)) {
      dispatchKeyEvent(element, "keyup", { key, ...modifiers })
    }
  }

  return { success: true }
}

/** Chooses a <select> option by value, label, or index, firing change. */
export const executeSelect = async (step: SelectStep): Promise<StepResult> => {
  const element = await findElement(step.target)
  if (!element) {
    return missingElementResult(step.target)
  }

  if (getTagName(element) !== "SELECT") {
    return { success: false, error: "Select target is not a <select> element" }
  }

  await applyTargeting(element, step.targeting)

  const select = element as HTMLSelectElement
  const options = Array.from(select.querySelectorAll("option"))

  let chosen: HTMLOptionElement | undefined
  if (step.by.value !== undefined) {
    chosen = options.find(
      (option) => option.getAttribute("value") === step.by.value,
    ) as HTMLOptionElement | undefined
  } else if (step.by.label !== undefined) {
    chosen = options.find(
      (option) => option.textContent?.trim() === step.by.label,
    ) as HTMLOptionElement | undefined
  } else if (step.by.index !== undefined) {
    chosen = options[step.by.index] as HTMLOptionElement | undefined
  }

  if (!chosen) {
    return {
      success: false,
      error: `No option matched ${JSON.stringify(step.by)}`,
    }
  }

  // Single-select semantics: selecting the chosen option deselects the rest,
  // so only the chosen option's property is written (assigning false to
  // siblings trips buggy setters in lightweight DOMs). The attribute is also
  // synced for DOMs whose property getter reads it.
  for (const option of options) {
    if (option === chosen) {
      ;(option as HTMLOptionElement).selected = true
      option.setAttribute("selected", "")
    } else {
      option.removeAttribute("selected")
    }
  }

  // Best-effort prototype value setter for framework-controlled selects;
  // some DOM implementations expose value as getter-only, where option
  // selection above already changed the state.
  try {
    setNativeValue(select, chosen.getAttribute("value") ?? chosen.value ?? "")
  } catch {
    // Option selection is the source of truth; ignore setter failures.
  }

  if (step.fireChange !== false) {
    dispatchSimpleEvent(select, "input")
    dispatchSimpleEvent(select, "change")
  }

  return { success: true }
}

/** Sets checkbox/radio checked state, clicking only when it must change. */
export const executeSetChecked = async (
  step: CheckStep | UncheckStep,
): Promise<StepResult> => {
  const element = await findElement(step.target)
  if (!element) {
    return missingElementResult(step.target)
  }

  const desired = step.op === "check"
  const input = element as HTMLInputElement

  if (getTagName(element) !== "INPUT") {
    return { success: false, error: "Check target is not an <input> element" }
  }

  await applyTargeting(element, step.targeting)

  if (Boolean(input.checked) === desired) {
    return { success: true }
  }

  // Click so the page receives the natural event sequence; fall back to
  // setting the property and firing change for environments without click().
  if (typeof input.click === "function") {
    input.click()
  } else {
    input.checked = desired
    dispatchSimpleEvent(input, "input")
    dispatchSimpleEvent(input, "change")
  }

  if (Boolean(input.checked) !== desired) {
    input.checked = desired
    dispatchSimpleEvent(input, "input")
    dispatchSimpleEvent(input, "change")
  }

  return { success: true }
}

/**
 * Submits a form. A non-form target submits its closest enclosing form.
 * Prefers requestSubmit() (runs validation and the submit event) and falls
 * back to dispatching a submit event plus submit().
 */
export const executeSubmit = async (step: SubmitStep): Promise<StepResult> => {
  const element = await findElement(step.target)
  if (!element) {
    return missingElementResult(step.target)
  }

  const form =
    getTagName(element) === "FORM"
      ? (element as HTMLFormElement)
      : (element.closest?.("form") as HTMLFormElement | null)

  if (!form) {
    return {
      success: false,
      error: "Submit target is not a form and has no enclosing form",
    }
  }

  if (typeof form.requestSubmit === "function") {
    form.requestSubmit()
    return { success: true }
  }

  dispatchSimpleEvent(form, "submit")
  if (typeof form.submit === "function") {
    form.submit()
  }

  return { success: true }
}

const isSingleKeyName = (entry: string): boolean => {
  if (entry.length === 1) {
    return true
  }

  // Multi-character entries are key names only when they match known
  // KeyboardEvent.key identifiers; anything else is literal text to type.
  return /^(Enter|Tab|Backspace|Delete|Escape|Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown|Alt|Control|Meta|Shift|F\d{1,2})$/.test(
    entry,
  )
}

const applyEditingKey = (element: Element, key: string): void => {
  if (!isValueInput(element)) {
    return
  }

  const input = element as HTMLInputElement
  if (key === "Backspace" && input.value.length > 0) {
    setNativeValue(input, input.value.slice(0, -1))
    dispatchSimpleEvent(input, "input")
  } else if (key.length === 1) {
    setNativeValue(input, input.value + key)
    dispatchSimpleEvent(input, "input")
  }
}

const appendText = (element: Element, text: string): void => {
  if (isValueInput(element)) {
    const input = element as HTMLInputElement
    setNativeValue(input, (input.value ?? "") + text)
    return
  }

  if ((element as HTMLElement).isContentEditable) {
    const htmlElement = element as HTMLElement
    htmlElement.textContent = (htmlElement.textContent ?? "") + text
  }
}
