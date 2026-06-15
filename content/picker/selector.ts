// Architecture: content layer. Stable CSS-selector generation for the generic
// element picker (content/picker). Given a clicked Element, produce a selector
// that re-finds it across reloads and SPA re-renders — preferring a unique
// `#id`, then an ascending `tag:nth-of-type` path anchored on the nearest
// id'd ancestor, validated for uniqueness against the live document at each
// step. Compatible with the workflow `css` Selector strategy
// (shared/types/workflow.ts). This module never mutates the DOM. See
// docs/surfaces.md and docs/element-hider.md.
import type { PickedElement } from "../../shared/types"

const VALID_ID = /^[A-Za-z_][\w-]*$/

// CSS.escape exists in every browser content context; the fallback only matters
// for non-DOM test runners.
const cssEscape = (value: string): string =>
  typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/[^\w-]/g, "\\$&")

const isValidId = (id: string): boolean => VALID_ID.test(id)

// Class tokens too volatile to anchor on (framework hashes, utility churn).
// Heuristic only — uniqueness is still validated afterwards.
const isStableClass = (cls: string): boolean =>
  cls.length > 0 &&
  cls.length <= 40 &&
  /^[A-Za-z_-][\w-]*$/.test(cls) &&
  !/\d{4,}/.test(cls) &&
  !/^(css|sc|jsx|emotion|svelte)-/.test(cls)

const uniqueIn = (root: Document, selector: string): boolean => {
  try {
    return root.querySelectorAll(selector).length === 1
  } catch {
    return false
  }
}

const nthOfTypeIndex = (element: Element): number => {
  let index = 1
  let sibling = element.previousElementSibling
  while (sibling) {
    if (sibling.tagName === element.tagName) {
      index += 1
    }
    sibling = sibling.previousElementSibling
  }
  return index
}

// One path segment: `tag`, `tag.class`, or `tag:nth-of-type(n)` when there are
// same-type siblings.
const segmentFor = (element: Element): string => {
  const tag = element.tagName.toLowerCase()
  const stableClass = Array.from(element.classList).find(isStableClass)
  const base = stableClass ? `${tag}.${cssEscape(stableClass)}` : tag

  const sameTypeSiblings = element.parentElement
    ? Array.from(element.parentElement.children).filter(
        (child) => child.tagName === element.tagName,
      ).length
    : 1

  return sameTypeSiblings > 1
    ? `${base}:nth-of-type(${nthOfTypeIndex(element)})`
    : base
}

/**
 * The shortest stable selector that uniquely identifies `element` in its
 * document. Falls back to a full positional path when nothing is unique.
 */
export const buildStableSelector = (element: Element): string => {
  const doc = element.ownerDocument

  const ownId = element.getAttribute("id")
  if (ownId && isValidId(ownId)) {
    const sel = `#${cssEscape(ownId)}`
    if (uniqueIn(doc, sel)) {
      return sel
    }
  }

  const parts: string[] = []
  let current: Element | null = element

  while (current && current !== doc.documentElement) {
    // `current` is always the direct parent of the element that produced
    // parts[0], so anchoring on its id with `>` stays correct.
    const id = current.getAttribute("id")
    if (id && isValidId(id)) {
      const idSel = `#${cssEscape(id)}`
      const candidate = parts.length ? `${idSel} > ${parts.join(" > ")}` : idSel
      if (uniqueIn(doc, candidate)) {
        return candidate
      }
    }

    parts.unshift(segmentFor(current))
    const candidate = parts.join(" > ")
    if (uniqueIn(doc, candidate)) {
      return candidate
    }

    current = current.parentElement
  }

  return parts.join(" > ")
}

/**
 * Build the rich PickedElement payload reported back to the owning feature.
 * When `cssProps` is provided (from the picker surface's `content.css` config),
 * the element's computed values for those properties are captured too — the
 * only place this can happen, since content holds the live DOM element.
 */
export const describeElement = (
  element: Element,
  cssProps?: string[],
): PickedElement => {
  const selection: PickedElement = {
    selector: buildStableSelector(element),
    tagName: element.tagName,
  }

  const id = element.getAttribute("id")
  if (id) {
    selection.id = id
  }

  const classes = Array.from(element.classList)
  if (classes.length > 0) {
    selection.classes = classes.slice(0, 50)
  }

  const text = (element.textContent ?? "").trim().replace(/\s+/g, " ")
  if (text) {
    selection.innerText = text.slice(0, 200)
  }

  const href = element.getAttribute("href")
  if (href) {
    selection.href = href.slice(0, 2000)
  }

  const role = element.getAttribute("role")
  if (role) {
    selection.role = role
  }

  if (cssProps && cssProps.length > 0) {
    const computed = window.getComputedStyle(element)
    const css: Record<string, string> = {}
    for (const prop of cssProps) {
      const value = computed.getPropertyValue(prop).trim()
      if (value) {
        css[prop] = value
      }
    }
    if (Object.keys(css).length > 0) {
      selection.css = css
    }
  }

  return selection
}
