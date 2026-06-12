// Architecture: content layer. Shared DOM primitives for the workflow
// executor (content/workflow/executor.ts): selector resolution for the two
// Selector strategies (css | text), visibility checks, pre-action targeting,
// and environment-tolerant event helpers. Op modules (interactionOps,
// formOps, domOps, waitOps) build on these so element semantics stay
// identical across every operation. Runs inside the page (content script);
// must not touch privileged extension APIs.
import type { Selector } from "../../shared/types/workflow"

export type FindElementOptions = {
  // Text-strategy matches normally require the holding element to be
  // visible; wait conditions checking hidden/detached states opt out.
  includeHiddenText?: boolean
}

export const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * Resolves the window owning an element. Test environments (linkedom) stub
 * globals per-document, so event constructors must come from the element's
 * own view rather than the ambient global.
 */
export const getElementWindow = (
  element: Element,
): Window & typeof globalThis => {
  return (element.ownerDocument?.defaultView ?? window) as Window &
    typeof globalThis
}

/**
 * Finds every element matching a selector, in document order. CSS errors
 * throw (fail loudly — a typo'd selector is an authoring bug, not a missing
 * element). The `index` field of the selector is ignored here; callers that
 * want one element use findElement.
 */
export const findElements = async (
  selector: Selector,
  options: FindElementOptions = {},
): Promise<Element[]> => {
  switch (selector.strategy) {
    case "css":
      return findElementsByCSS(selector.value)
    case "text":
      return await findElementsByText(selector, options)
    default: {
      const error = `Unsupported selector strategy: ${(selector as any).strategy}`
      console.error(`[WorkflowExecutor] ${error}`, selector)
      throw new Error(error)
    }
  }
}

/**
 * Finds the single element addressed by a selector (its `index` field picks
 * the Nth match, default 0). Returns null when nothing matches.
 */
export const findElement = async (
  selector: Selector,
  options: FindElementOptions = {},
): Promise<Element | null> => {
  const elements = await findElements(selector, options)
  const index = selector.index ?? 0
  return elements[index] || null
}

const findElementsByCSS = (value: string): Element[] => {
  try {
    return Array.from(document.querySelectorAll(value))
  } catch (error) {
    console.error("[WorkflowExecutor] CSS selector error:", {
      selector: value,
      error: error instanceof Error ? error.message : "Invalid CSS selector",
    })
    throw new Error(
      `Invalid CSS selector "${value}": ${
        error instanceof Error ? error.message : "Unknown selector error"
      }`,
    )
  }
}

const findElementsByText = async (
  selector: {
    strategy: "text"
    value: string
    exact?: boolean
    within?: Selector
  },
  options: FindElementOptions,
): Promise<Element[]> => {
  let searchRoot: Element | Document = document
  if (selector.within) {
    const withinElement = await findElement(selector.within, options)
    if (!withinElement) {
      console.log("[WorkflowExecutor] 'within' element not found")
      return []
    }
    searchRoot = withinElement
  }

  const walker = document.createTreeWalker(
    searchRoot,
    NodeFilter.SHOW_TEXT,
    null,
  )

  const elements: Element[] = []
  let node: Node | null = walker.nextNode()

  while (node) {
    const text = node.textContent?.trim() || ""
    const matches = selector.exact
      ? text === selector.value
      : text.includes(selector.value)

    if (matches && node.parentElement) {
      if (options.includeHiddenText || isElementVisible(node.parentElement)) {
        elements.push(node.parentElement)
      }
    }

    node = walker.nextNode()
  }

  return elements
}

export const isElementVisible = (element: Element): boolean => {
  if (!element.isConnected) return false

  const rect = element.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) return false

  const style = window.getComputedStyle(element)
  if (style.display === "none" || style.visibility === "hidden") return false

  return true
}

/**
 * Applies the shared pre-action targeting options: optionally asserts
 * visibility (throws — the step fails loudly) and scrolls into view.
 */
export const applyTargeting = async (
  element: Element,
  targeting?: { scrollIntoView?: boolean; ensureVisible?: boolean },
): Promise<void> => {
  const scrollIntoView = targeting?.scrollIntoView ?? true
  const ensureVisible = targeting?.ensureVisible ?? true

  if (ensureVisible && !isElementVisible(element)) {
    throw new Error("Element is not visible")
  }

  if (scrollIntoView && typeof element.scrollIntoView === "function") {
    element.scrollIntoView({
      block: "center",
      inline: "center",
      behavior: "smooth",
    })
    await sleep(100)
  }
}

/**
 * Dispatches a simple bubbling event (input/change/focus/...) constructed
 * from the element's own window so it crosses test-environment boundaries.
 */
export const dispatchSimpleEvent = (
  element: Element,
  type: string,
  init: EventInit = { bubbles: true, cancelable: true },
): void => {
  const win = getElementWindow(element)
  element.dispatchEvent(new win.Event(type, init))
}

/**
 * Dispatches a keyboard event, falling back to a plain Event carrying the
 * keyboard fields when the environment has no KeyboardEvent constructor.
 */
export const dispatchKeyEvent = (
  element: Element,
  type: "keydown" | "keyup" | "keypress",
  init: {
    key: string
    altKey?: boolean
    ctrlKey?: boolean
    metaKey?: boolean
    shiftKey?: boolean
  },
): void => {
  const win = getElementWindow(element)
  const eventInit = { bubbles: true, cancelable: true, ...init }

  if (typeof win.KeyboardEvent === "function") {
    element.dispatchEvent(new win.KeyboardEvent(type, eventInit))
    return
  }

  const event = new win.Event(type, { bubbles: true, cancelable: true })
  Object.assign(event, init)
  element.dispatchEvent(event)
}

/**
 * Sets an input/textarea value through the prototype's `value` setter so
 * frameworks tracking instance-level value descriptors (React) observe the
 * change, then leaves event firing to the caller.
 */
export const setNativeValue = (element: Element, value: string): void => {
  let prototype = Object.getPrototypeOf(element)
  while (prototype) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value")
    if (descriptor?.set) {
      descriptor.set.call(element, value)
      return
    }
    prototype = Object.getPrototypeOf(prototype)
  }

  ;(element as HTMLInputElement).value = value
}

export const getTagName = (element: Element): string =>
  element.tagName?.toUpperCase?.() ?? ""

/** True for <input>/<textarea> elements (duck-typed for test DOMs). */
export const isValueInput = (element: Element): boolean => {
  const tag = getTagName(element)
  return tag === "INPUT" || tag === "TEXTAREA"
}
