import type { RefObject } from "react"
import { useMemo } from "react"
import type { FormField } from "../../../../shared/types"
import { useInlineInputKeys } from "../../../hooks/useInlineInputKeys"
import { useAppDispatch, useAppSelector } from "../../../store/hooks"
import {
  selectCurrentPage,
  setFormValue,
} from "../../../store/slices/navigation.slice"
import { getDefaultValue } from "../../../utils/forms"
import { validateWithJsonSchema } from "../../../utils/validation"
import { CommandItemColor } from "./CommandItemColor"
import { CommandItemMulti } from "./CommandItemMulti"
import { CommandItemSelect } from "./CommandItemSelect"
import { CommandItemSwitch } from "./CommandItemSwitch"

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
  const { handleCommonKeys } = useInlineInputKeys()

  const _currentValue =
    currentPage.formValues?.[field.id] || getDefaultValue(field)

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
    if (handleCommonKeys(e as any)) return
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
                className={`validation-dot ${validationResult.isValid ? "valid" : "invalid"
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
        onSubmit={onSubmit}
      />
    )
  }

  if (field.type === "checkbox" || field.type === "switch") {
    return (
      <CommandItemSwitch
        field={field as any}
        inputRef={inputRef as any}
        onKeyDown={onKeyDown}
      />
    )
  }

  if (field.type === "multi") {
    return (
      <CommandItemMulti
        field={field as any}
        inputRef={inputRef as any}
        onKeyDown={onKeyDown}
      />
    )
  }

  if (field.type === "color") {
    return (
      <CommandItemColor
        field={field as any}
        inputRef={inputRef as any}
        onKeyDown={onKeyDown}
      />
    )
  }

  // TODO: Add support for multiselect types
  return null
}
