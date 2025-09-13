import type { RefObject } from "react"
import { useMemo } from "react"
import type { FormField } from "../../../../shared/types"
import { useAppDispatch, useAppSelector } from "../../../store/hooks"
import {
  selectCurrentPage,
  setFormValue,
} from "../../../store/slices/navigation.slice"
import { validateWithJsonSchema } from "../../../utils/validation"
import { CommandItemSelect } from "./CommandItemSelect"

interface CommandItemInputProps {
  field: FormField
  inputRef: RefObject<HTMLInputElement | null>
  onKeyDown: (e: React.KeyboardEvent<any>) => void
  onSubmit?: () => void // Called when Enter is pressed or input is blurred
}

export function CommandItemInput({
  field,
  inputRef,
  onKeyDown,
  onSubmit,
}: CommandItemInputProps) {
  const dispatch = useAppDispatch()
  const currentPage = useAppSelector(selectCurrentPage)

  // Get default value based on field type
  const getDefaultValue = () => {
    if (field.type === "text") {
      return field.defaultValue || ""
    }
    if (field.type === "select") {
      return field.defaultValue || ""
    }
    return ""
  }

  const _currentValue = currentPage.formValues?.[field.id] || getDefaultValue()

  // Validate current value
  const validationResult = useMemo(() => {
    return validateWithJsonSchema(_currentValue, field.validation)
  }, [_currentValue, field.validation])

  const _handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setFormValue({ fieldId: field.id, value: e.target.value }))
  }

  const _handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // eslint-disable-next-line no-console
    console.log("[CMDK][Input] KeyDown", e.key, { id: field.id })
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault()
      // eslint-disable-next-line no-console
      console.log("[CMDK][Input] Submit via Enter", { id: field.id })
      onSubmit()
      return
    }

    // Prevent backspace from navigating backwards
    if (e.key === "Backspace") {
      e.stopPropagation()
      // Don't prevent default - let the input handle the backspace normally
      return
    }

    // Escape should refocus the main cmdk search input rather than navigating back
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      // eslint-disable-next-line no-console
      console.log("[CMDK][Input] Escape -> focus search", { id: field.id })
      const searchInput = document.querySelector(
        "input[cmdk-input]",
      ) as HTMLInputElement | null
      searchInput?.focus()
      return
    }

    onKeyDown(e)
  }

  // Removed blur handler to prevent double submission
  // User should press Enter to submit, not blur

  if (field.type === "text") {
    return (
      <>
        <div className="command-item-content">
          <div className="command-item-inline-input">
            <input
              id={field.id}
              ref={inputRef}
              type="text"
              placeholder={field.placeholder}
              value={_currentValue}
              onChange={_handleChange}
              onKeyDown={_handleKeyDown}
            />
            {/* Validation indicator */}
            <div className="validation-indicator">
              <span
                className={`validation-dot ${
                  validationResult.isValid ? "valid" : "invalid"
                }`}
                title={validationResult.error || "Valid"}
              />
            </div>
          </div>
          <span cmdk-raycast-meta="">{field.label}</span>
        </div>
      </>
    )
  }

  if (field.type === "select") {
    return (
      <CommandItemSelect
        field={field}
        inputRef={inputRef as any}
        onKeyDown={onKeyDown as any}
        onSubmit={onSubmit}
      />
    )
  }

  // TODO: Add support for checkbox types
  return null
}
