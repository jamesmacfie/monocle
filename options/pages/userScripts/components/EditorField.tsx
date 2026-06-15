import type { PropsWithChildren } from "react"

export function EditorField({
  label,
  children,
}: PropsWithChildren<{ label: string }>) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-xs font-medium text-[var(--color-fg-muted)]">
        {label}
      </span>
      {children}
    </label>
  )
}
