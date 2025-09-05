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
      {keybinding.split(" ").map((key, index) => {
        // Normalize key symbols for better display
        const normalizedKey = key
          .replace(/⌃/g, "⌃")
          .replace(/⌘/g, "⌘")
          .replace(/⌥/g, "⌥")
          .replace(/⇧/g, "⇧")
          .replace(/↵/g, "↵")

        return <kbd key={`${key}-${index}`}>{normalizedKey}</kbd>
      })}
    </div>
  )
}
