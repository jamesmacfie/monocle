interface KeybindingDisplayProps {
  keybinding: string
  className?: string
}

export function KeybindingDisplay({
  keybinding,
  className = "",
}: KeybindingDisplayProps) {
  return (
    <div
      className={`flex items-center gap-1 ${className}`}
      cmdk-raycast-submenu-shortcuts=""
    >
      {keybinding.split(",").map((stroke, sIdx) => {
        const parts = stroke.trim().split(" ").filter(Boolean)

        return (
          <div key={`stroke-${sIdx}`} className="flex items-center gap-1">
            {parts.map((key, index) => {
              const normalizedKey = key
                .replace(/⌃/g, "⌃")
                .replace(/⌘/g, "⌘")
                .replace(/⌥/g, "⌥")
                .replace(/⇧/g, "⇧")
                .replace(/↵/g, "↵")

              return <kbd key={`${key}-${index}`}>{normalizedKey}</kbd>
            })}
            {sIdx < keybinding.split(",").length - 1 && (
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
