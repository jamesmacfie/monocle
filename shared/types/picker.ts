// Architecture: shared/ type layer. The PickedElement — the structured result
// of a generic `picker` surface gesture. When a tab is in pick mode (a feature
// pushed a `picker` surface), content highlights the element under the cursor
// and, on click, resolves a stable CSS selector plus descriptive metadata and
// reports it back to the owning feature via the `surface-action` message
// (`selection` field). The surface NEVER mutates the page itself — the owning
// feature decides what the selection means (hide it, copy the selector, extract
// text, watch it, …). Element Hider is merely the first consumer.
//
// The bounded free-text fields are validated in shared/types/validation.ts
// (PickedElementSchema, the message-boundary schema). See docs/surfaces.md.
export type PickedElement = {
  // Stable CSS selector generated in content (compatible with the workflow
  // `css` Selector strategy in ./workflow.ts).
  selector: string
  // Upper-case tag name, e.g. "DIV".
  tagName: string
  id?: string
  classes?: string[]
  // Trimmed/truncated visible text, for feature UI and labels only.
  innerText?: string
  // Present for anchors / media so a feature can act on the link target.
  href?: string
  role?: string
}
