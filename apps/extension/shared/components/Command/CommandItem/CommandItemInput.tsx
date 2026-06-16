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

interface CommandItemInputProps {
  field: FormField & { type: "text" }
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

  const currentValue =
    currentPage.formValues?.[field.id] || getDefaultValue(field)

  // Validate current value
  const validationResult = useMemo(() => {
    return validateWithJsonSchema(currentValue, field.validation)
  }, [currentValue, field.validation])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setFormValue({ fieldId: field.id, value: e.target.value }))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault()
      onSubmit()
      return
    }
    if (handleCommonKeys(e as any)) return
    onKeyDown(e)
  }

  return (
    <div className="command-item-content">
      <div className="command-item-inline-input">
        <input
          id={field.id}
          ref={inputRef}
          type="text"
          placeholder={field.placeholder}
          value={currentValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
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
  )
}
