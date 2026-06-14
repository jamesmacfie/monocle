// Shared declarative content-block vocabulary.
//
// A `ContentBlock[]` is the closed, validated schema for structured content
// rendered by Monocle components — never author-supplied markup (the same
// posture as Surfaces and the site SDK). It is rendered by one generic
// component (`shared/components/ContentBlocks/`) mounted in two places:
//   - inside a calculation's palette row (docs/v_next/11-calculations.md), and
//   - (future) inside richer Surfaces content (docs/v_next/03-surfaces…).
//
// Same Zod-validated data, same React renderer, two mount points. Keep this
// union and its Zod validator (`./contentValidation`) in lockstep.

export type ContentBlock =
  | { type: "code"; lang?: string; text: string }
  | { type: "keyValue"; rows: Array<{ label: string; value: string }> }
  // Rendered as escaped plain text in v1 (no markdown parser dependency yet);
  // full sanitized markdown rendering is future work.
  | { type: "markdown"; text: string }
  | { type: "image"; dataUrl: string }
