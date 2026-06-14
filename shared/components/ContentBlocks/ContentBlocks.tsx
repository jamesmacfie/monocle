import type { ContentBlock } from "../../types"
import { cn } from "../ui/cn"

// One generic renderer for the shared declarative content-block vocabulary
// (shared/types/content.ts). It turns a validated `ContentBlock[]` into React,
// themed entirely through Monocle's semantic tokens so it renders identically
// in the closed content shadow root and in normal new-tab/options DOM.
//
// Calculations are the first consumer (rendered inside a palette row); richer
// Surfaces content will reuse this same component. Blocks are display-only:
// they never capture focus or steal arrow keys, so a block stack hosted inside
// a cmdk row stays a single selectable unit. See docs/v_next/11-calculations.md.

interface ContentBlocksProps {
  blocks: ContentBlock[]
  className?: string
}

export function ContentBlocks({ blocks, className }: ContentBlocksProps) {
  if (!blocks.length) {
    return null
  }
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {blocks.map((block, index) => (
        <ContentBlockView key={index} block={block} />
      ))}
    </div>
  )
}

function ContentBlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case "keyValue":
      return <KeyValueBlock rows={block.rows} />
    case "code":
      return <CodeBlock text={block.text} />
    case "markdown":
      // v1: rendered as escaped plain text (React escapes {text}); full
      // sanitized markdown rendering is future work.
      return (
        <div className="whitespace-pre-wrap text-sm text-[var(--color-fg)]">
          {block.text}
        </div>
      )
    case "image":
      return (
        <img
          src={block.dataUrl}
          alt=""
          className="max-h-40 max-w-full rounded-md border border-[var(--color-border)]"
        />
      )
    default:
      return null
  }
}

function KeyValueBlock({
  rows,
}: {
  rows: Array<{ label: string; value: string }>
}) {
  return (
    <div className="flex flex-col gap-1">
      {rows.map((row, index) => (
        <div key={index} className="flex items-baseline justify-between gap-3">
          <span className="text-sm text-[var(--color-fg-muted)]">
            {row.label}
          </span>
          <span className="text-sm font-medium text-[var(--color-fg)] tabular-nums">
            {row.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function CodeBlock({ text }: { text: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
      <code className="text-xs text-[var(--color-fg)]">{text}</code>
    </pre>
  )
}
