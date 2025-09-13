import type { RefObject } from "react"
import type { FormField } from "../../../../shared/types"
import { useAppDispatch, useAppSelector } from "../../../store/hooks"
import {
  selectCurrentPage,
  setFormValue,
} from "../../../store/slices/navigation.slice"

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

  const _handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch(setFormValue({ fieldId: field.id, value: e.target.value }))
  }

  const _handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && onSubmit) {
      e.preventDefault()
      onSubmit()
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
          </div>
          <span cmdk-raycast-meta="">{field.label}</span>
        </div>
      </>
    )
  }

  // TODO: Add support for select and checkbox types
  return null
}
