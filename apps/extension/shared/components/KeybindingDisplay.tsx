import { toDisplayFormat } from "../utils/key-normalizer"

interface KeybindingDisplayProps {
  keybinding: string
  className?: string
}

export function KeybindingDisplay({
  keybinding,
  className = "",
}: KeybindingDisplayProps) {
  // Convert canonical format to display format
  // The toDisplayFormat now separates modifiers with spaces (e.g., "⌘ ⇧ P" not "⌘⇧ P")
  const displayKeybinding = toDisplayFormat(keybinding)

  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      cmdk-raycast-submenu-shortcuts=""
    >
      {displayKeybinding.split(",").map((stroke, sIdx) => {
        // Each stroke is already formatted with spaces between modifiers
        const parts = stroke.trim().split(" ").filter(Boolean)

        return (
          <div key={`stroke-${sIdx}`} className="flex items-center gap-1">
            {parts.map((key, index) => (
              <kbd key={`${key}-${index}`}>{key}</kbd>
            ))}
            {sIdx < displayKeybinding.split(",").length - 1 && (
              <span className="px-1 text-xs text-[var(--cmdk-muted-foreground)]">
                →
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
