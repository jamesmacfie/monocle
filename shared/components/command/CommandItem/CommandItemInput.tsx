import type { RefObject } from "react"
import type { FormField } from "../../../../shared/types"

interface CommandItemInputProps {
  field: FormField
  inputRef: RefObject<HTMLInputElement | null>
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
}

export function CommandItemInput({
  field,
  inputRef,
  onKeyDown,
}: CommandItemInputProps) {
  if (field.type === "text") {
    return (
      <div className="command-item-inline-input">
        {field.label && (
          <label className="command-item-label" htmlFor={field.id}>
            {field.label}
          </label>
        )}
        <input
          id={field.id}
          ref={inputRef}
          type="text"
          placeholder={field.placeholder}
          defaultValue={field.defaultValue}
          onKeyDown={onKeyDown}
        />
      </div>
    )
  }

  // TODO: Add support for select and checkbox types
  return null
}
