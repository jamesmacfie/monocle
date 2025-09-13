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
  const handleClick = () => {
    if (!disabled) {
      onSubmit()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      handleClick()
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
