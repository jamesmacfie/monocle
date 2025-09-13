import type { RefObject } from "react"

interface CommandItemSubmitProps {
  label: string
  inputRef: RefObject<HTMLButtonElement | null>
  onSubmit: () => void
  disabled?: boolean
}

export function CommandItemSubmit({
  label,
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
    <button
      ref={inputRef}
      type="button"
      className="command-item-submit-button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled}
    >
      {label}
    </button>
  )
}
