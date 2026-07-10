// Architecture: content layer. Pointer-and-focus workflow operations —
// click (native + synthetic event sequences), hover, focus, blur, and
// scroll. One of the workflow executor's op modules (dispatch table in
// content/workflow/executor.ts). Element lookup and visibility semantics
// come from content/workflow/dom.ts so they match every other op.
import type {
  BlurStep,
  ClickStep,
  FocusStep,
  HoverStep,
  ScrollStep,
  StepResult,
} from "../../shared/types/workflow"
import {
  applyTargeting,
  dispatchSimpleEvent,
  findElement,
  getElementWindow,
  missingElementResult,
  sleep,
} from "./dom"

/** Clicks the target, preferring the native click() for plain left-clicks. */
export const executeClick = async (step: ClickStep): Promise<StepResult> => {
  const element = await findElement(step.target)
  if (!element) {
    return missingElementResult(step.target)
  }

  await applyTargeting(element, step.targeting)
  await clickElement(element, step)

  return { success: true }
}

/** Dispatches the synthetic hover sequence (pointerover/mouseover/...). */
export const executeHover = async (step: HoverStep): Promise<StepResult> => {
  const element = await findElement(step.target)
  if (!element) {
    return missingElementResult(step.target)
  }

  await applyTargeting(element, step.targeting)

  for (const type of [
    "pointerover",
    "mouseover",
    "mouseenter",
    "pointermove",
    "mousemove",
  ]) {
    dispatchMouseEvent(element, type, {}, 0)
  }

  return { success: true }
}

/** Moves focus to the target element. */
export const executeFocus = async (step: FocusStep): Promise<StepResult> => {
  const element = await findElement(step.target)
  if (!element) {
    return missingElementResult(step.target)
  }

  await applyTargeting(element, step.targeting)
  focusElement(element)
  return { success: true }
}

/** Removes focus from the target element. */
export const executeBlur = async (step: BlurStep): Promise<StepResult> => {
  const element = await findElement(step.target, { includeHiddenText: true })
  if (!element) {
    return missingElementResult(step.target)
  }

  const htmlElement = element as HTMLElement
  if (typeof htmlElement.blur === "function") {
    htmlElement.blur()
  } else {
    dispatchSimpleEvent(element, "blur", { bubbles: false })
  }
  return { success: true }
}

/** Scrolls the window (no target) or an element to the requested position. */
export const executeScroll = async (step: ScrollStep): Promise<StepResult> => {
  const behavior = step.behavior ?? "auto"

  if (!step.target) {
    scrollWindow(step, behavior)
    return { success: true }
  }

  const element = await findElement(step.target)
  if (!element) {
    return missingElementResult(step.target)
  }

  if (typeof step.to === "object" && "intoView" in step.to) {
    if (typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ block: "center", inline: "center", behavior })
    }
    return { success: true }
  }

  scrollElement(element, step.to, behavior)
  return { success: true }
}

const focusElement = (element: Element): void => {
  const htmlElement = element as HTMLElement
  if (typeof htmlElement.focus === "function") {
    htmlElement.focus()
    return
  }
  dispatchSimpleEvent(element, "focus", { bubbles: false })
}

const scrollWindow = (step: ScrollStep, behavior: ScrollBehavior): void => {
  if (typeof window.scrollTo !== "function") {
    return
  }

  const pageHeight = document.documentElement?.scrollHeight ?? 0

  if (step.to === "top") {
    window.scrollTo({ top: 0, behavior })
  } else if (step.to === "bottom") {
    window.scrollTo({ top: pageHeight, behavior })
  } else if (step.to === "center") {
    window.scrollTo({ top: pageHeight / 2, behavior })
  } else if (typeof step.to === "object" && "x" in step.to) {
    window.scrollTo({ left: step.to.x, top: step.to.y, behavior })
  }
}

const scrollElement = (
  element: Element,
  to: Exclude<ScrollStep["to"], { intoView: true }>,
  behavior: ScrollBehavior,
): void => {
  if (typeof element.scrollTo !== "function") {
    return
  }

  if (to === "top") {
    element.scrollTo({ top: 0, behavior })
  } else if (to === "bottom") {
    element.scrollTo({ top: element.scrollHeight, behavior })
  } else if (to === "center") {
    element.scrollTo({ top: element.scrollHeight / 2, behavior })
  } else if (typeof to === "object" && "x" in to) {
    element.scrollTo({ left: to.x, top: to.y, behavior })
  }
}

const clickElement = async (
  element: Element,
  step: ClickStep,
): Promise<void> => {
  const htmlElement = element as HTMLElement

  if (
    !requiresSyntheticClick(step) &&
    typeof htmlElement.click === "function"
  ) {
    htmlElement.click()
    return
  }

  await dispatchClickSequence(element, step)
}

const requiresSyntheticClick = (step: ClickStep): boolean => {
  return (
    step.button !== undefined ||
    step.clickCount !== undefined ||
    step.delayMs !== undefined ||
    (step.modifiers?.length ?? 0) > 0
  )
}

const dispatchClickSequence = async (
  element: Element,
  step: ClickStep,
): Promise<void> => {
  const clickCount = step.clickCount ?? 1

  dispatchMouseEvent(element, "pointerover", step, 0)
  dispatchMouseEvent(element, "mouseover", step, 0)
  dispatchMouseEvent(element, "mousemove", step, 0)

  for (let clickIndex = 0; clickIndex < clickCount; clickIndex++) {
    const detail = clickIndex + 1

    dispatchMouseEvent(element, "pointerdown", step, detail)
    dispatchMouseEvent(element, "mousedown", step, detail)

    if (step.delayMs) {
      await sleep(step.delayMs)
    }

    dispatchMouseEvent(element, "pointerup", step, detail)
    dispatchMouseEvent(element, "mouseup", step, detail)
    dispatchMouseEvent(element, "click", step, detail)

    if (step.button === "right") {
      dispatchMouseEvent(element, "contextmenu", step, detail)
    }
  }

  if ((step.clickCount ?? 1) === 2) {
    dispatchMouseEvent(element, "dblclick", step, 2)
  }
}

const dispatchMouseEvent = (
  element: Element,
  eventType: string,
  step: Partial<Pick<ClickStep, "button" | "modifiers">>,
  detail: number,
): void => {
  const rect = element.getBoundingClientRect()
  const button = step.button === "right" ? 2 : step.button === "middle" ? 1 : 0
  const win = getElementWindow(element)

  element.dispatchEvent(
    new win.MouseEvent(eventType, {
      bubbles: true,
      cancelable: true,
      view: win,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      button,
      buttons: eventType.includes("down") ? 1 << button : 0,
      detail,
      altKey: step.modifiers?.includes("Alt") ?? false,
      ctrlKey: step.modifiers?.includes("Control") ?? false,
      metaKey: step.modifiers?.includes("Meta") ?? false,
      shiftKey: step.modifiers?.includes("Shift") ?? false,
    }),
  )
}
