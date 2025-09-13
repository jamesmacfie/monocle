import type { RefObject } from "react"
import { useMemo } from "react"
import { useSearchInput } from "../../../hooks/useSearchInput"
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
  onKeyDown: (e: React.KeyboardEvent<HTMLSelectElement>) => void
  onSubmit?: () => void // Called when Enter is pressed
}

export function CommandItemSelect({
  field,
  inputRef,
  onKeyDown,
  onSubmit,
}: CommandItemSelectProps) {
  const dispatch = useAppDispatch()
  const currentPage = useAppSelector(selectCurrentPage)
  const { focusSearchInput, getSearchInput } = useSearchInput()

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
    // eslint-disable-next-line no-console
    console.log("[CMDK][Select] KeyDown", e.key, { id: field.id })
    // Override Up/Down arrows to navigate between command items instead of changing options
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      // Stop native select changing options
      e.preventDefault()
      e.stopPropagation()

      // If this is the first selectable item in the list and ArrowUp, focus search input
      const itemEl = (e.currentTarget as HTMLElement).closest(
        "[cmdk-item]",
      ) as HTMLElement | null
      const list = itemEl?.closest("[cmdk-list]")
      const firstItem = list?.querySelector(
        '[cmdk-item]:not([data-disabled="true"])',
      ) as HTMLElement | null
      if (e.key === "ArrowUp" && itemEl && firstItem === itemEl) {
        focusSearchInput()
        return
      }

      // Otherwise forward the arrow to CMDK search to change selection
      const searchInput = getSearchInput()
      if (searchInput) {
        const ev = new KeyboardEvent("keydown", { key: e.key, bubbles: true })
        searchInput.dispatchEvent(ev)
      }
      // eslint-disable-next-line no-console
      console.log("[CMDK][Select] Forwarding navigation", e.key, {
        id: field.id,
      })
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
      // eslint-disable-next-line no-console
      console.log("[CMDK][Select] Change value", {
        id: field.id,
        to: newValue,
        via: e.key,
      })
      return
    }

    // Prevent backspace from navigating backwards
    if (e.key === "Backspace") {
      e.stopPropagation()
      return
    }

    // Escape should refocus the main cmdk search input rather than navigating back
    if (e.key === "Escape") {
      e.preventDefault()
      e.stopPropagation()
      // eslint-disable-next-line no-console
      console.log("[CMDK][Select] Escape -> focus search", { id: field.id })
      focusSearchInput()
      return
    }

    // Handle Enter to submit
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault()
      // eslint-disable-next-line no-console
      console.log("[CMDK][Select] Submit via Enter", { id: field.id })
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
