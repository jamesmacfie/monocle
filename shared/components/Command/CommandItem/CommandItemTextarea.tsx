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

interface CommandItemTextareaProps {
  field: FormField & { type: "textarea" }
  inputRef: RefObject<HTMLTextAreaElement | null>
  onSubmit?: () => void // Called on Cmd/Ctrl+Enter (Enter inserts a newline)
}

export function CommandItemTextarea({
  field,
  inputRef,
  onSubmit,
}: CommandItemTextareaProps) {
  const dispatch = useAppDispatch()
  const currentPage = useAppSelector(selectCurrentPage)
  const { focusSearchInput, forwardArrowToCmdk, isFirstSelectableItem } =
    useInlineInputKeys()

  const currentValue =
    currentPage.formValues?.[field.id] || getDefaultValue(field)
  const textValue = Array.isArray(currentValue)
    ? currentValue.join(",")
    : currentValue

  // Validate current value
  const validationResult = useMemo(() => {
    return validateWithJsonSchema(textValue, field.validation)
  }, [textValue, field.validation])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    dispatch(setFormValue({ fieldId: field.id, value: e.target.value }))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl+Enter submits; plain Enter inserts a newline. Either way the
    // event must not bubble to CMDK, which treats Enter as item selection.
    if (e.key === "Enter") {
      e.stopPropagation()
      if ((e.metaKey || e.ctrlKey) && onSubmit) {
        e.preventDefault()
        onSubmit()
      }
      return
    }

    // Arrows move the caret inside the textarea. Only hand navigation back to
    // CMDK when the caret is already at the first/last position, so list
    // navigation still works from the field's edges.
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      const textarea = e.currentTarget
      const atStart = e.key === "ArrowUp" && textarea.selectionStart === 0
      const atEnd =
        e.key === "ArrowDown" && textarea.selectionEnd === textarea.value.length

      if (!atStart && !atEnd) {
        e.stopPropagation()
        return
      }

      e.preventDefault()
      e.stopPropagation()
      if (e.key === "ArrowUp" && isFirstSelectableItem(textarea)) {
        focusSearchInput()
        return
      }
      forwardArrowToCmdk(e.key)
      return
    }

    // Escape -> focus search (matches the other inline inputs)
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      focusSearchInput()
      return
    }

    // Backspace -> don't bubble to the container (don't navigate back)
    if (e.key === "Backspace") {
      e.stopPropagation()
    }
  }

  return (
    <div className="command-item-content">
      <div className="command-item-inline-input command-item-inline-textarea">
        <textarea
          id={field.id}
          ref={inputRef}
          rows={field.rows ?? 4}
          placeholder={field.placeholder}
          value={textValue}
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
