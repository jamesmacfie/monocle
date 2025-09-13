import type { RefObject } from "react"

interface CommandItemSubmitProps {
  label: string
  actionLabel: string
  inputRef: RefObject<HTMLButtonElement | null>
  onSubmit: () => void
  disabled?: boolean
}

export function CommandItemSubmit({
  label,
  actionLabel,
  inputRef,
  onSubmit,
  disabled = false,
}: CommandItemSubmitProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation() // Prevent the click from bubbling up to Command.Item
    if (!disabled) {
      onSubmit()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    // eslint-disable-next-line no-console
    console.log("[CMDK][Submit] KeyDown", e.key)
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      e.stopPropagation() // Also prevent keyboard events from bubbling
      if (!disabled) {
        // eslint-disable-next-line no-console
        console.log("[CMDK][Submit] Submit via", e.key)
        onSubmit()
      }
      return
    }

    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      // eslint-disable-next-line no-console
      console.log("[CMDK][Submit] Escape -> focus search")
      const searchInput = document.querySelector(
        "input[cmdk-input]",
      ) as HTMLInputElement | null
      searchInput?.focus()
      return
    }
  }

  return (
    <div className="command-item-content">
      <button
        ref={inputRef}
        type="button"
        className="command-item-submit-button"
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        disabled={disabled}
      >
        {actionLabel}
      </button>
    </div>
  )
}
