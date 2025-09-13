import type { RefObject } from "react"
import { useMemo } from "react"
import type { FormField } from "../../../../shared/types"
import { useAppDispatch, useAppSelector } from "../../../store/hooks"
import {
  selectCurrentPage,
  setFormValue,
} from "../../../store/slices/navigation.slice"
import { validateWithJsonSchema } from "../../../utils/validation"

interface CommandItemInputProps {
  field: FormField
  inputRef: RefObject<HTMLInputElement | null>
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
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
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault()
      onSubmit()
      return
    }

    // Prevent backspace from navigating backwards
    if (e.key === "Backspace") {
      e.stopPropagation()
      // Don't prevent default - let the input handle the backspace normally
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

  // TODO: Add support for select and checkbox types
  return null
}
