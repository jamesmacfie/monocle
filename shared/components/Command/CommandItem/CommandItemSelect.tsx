import type { RefObject } from "react"
import { useMemo } from "react"
import { useInlineInputKeys } from "../../../hooks/useInlineInputKeys"
import { useAppDispatch, useAppSelector } from "../../../store/hooks"
import {
  selectCurrentPage,
  setFormValue,
} from "../../../store/slices/navigation.slice"
import type { FormField } from "../../../types"
import { validateWithJsonSchema } from "../../../utils/validation"

interface CommandItemSelectProps {
  field: FormField & { type: "select" }
  inputRef: RefObject<HTMLSelectElement | null>
  onSubmit?: () => void // Called when Enter is pressed
}

export function CommandItemSelect({
  field,
  inputRef,
  onSubmit,
}: CommandItemSelectProps) {
  const dispatch = useAppDispatch()
  const currentPage = useAppSelector(selectCurrentPage)
  const {
    focusSearchInput,
    isFirstSelectableItem,
    forwardArrowToCmdk,
    handleCommonKeys,
  } = useInlineInputKeys()

  // Get default value
  const defaultValue = field.defaultValue || ""
  const currentValue = currentPage.formValues?.[field.id] || defaultValue

  // Validate current value
  const validationResult = useMemo(() => {
    return validateWithJsonSchema(currentValue, field.validation)
  }, [currentValue, field.validation])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    dispatch(setFormValue({ fieldId: field.id, value }))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLSelectElement>) => {
    // Up/Down should navigate CMDK items, not change option
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === "ArrowUp" && isFirstSelectableItem(e.currentTarget)) {
        focusSearchInput()
        return
      }
      forwardArrowToCmdk(e.key)
      return
    }

    // Handle Left/Right arrows to change selected option
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault()
      const currentIndex = field.options.findIndex(
        (opt) => opt.value === currentValue,
      )
      let newIndex: number

      if (e.key === "ArrowLeft") {
        // Move to previous option (or wrap to end)
        newIndex =
          currentIndex > 0 ? currentIndex - 1 : field.options.length - 1
      } else {
        // Move to next option (or wrap to beginning)
        newIndex =
          currentIndex < field.options.length - 1 ? currentIndex + 1 : 0
      }

      const newValue = field.options[newIndex].value
      dispatch(setFormValue({ fieldId: field.id, value: newValue }))
      return
    }

    if (handleCommonKeys(e as any)) return

    // Handle Enter to submit
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault()
      onSubmit()
      return
    }
  }

  return (
    <div className="command-item-content">
      <div className="command-item-select">
        <select
          ref={inputRef}
          value={currentValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          className="command-item-native-select"
        >
          {field.placeholder && (
            <option value="" disabled>
              {field.placeholder}
            </option>
          )}
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
