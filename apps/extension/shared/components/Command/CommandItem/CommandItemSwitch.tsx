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

interface CommandItemSwitchProps {
  field: FormField & { type: "checkbox" | "switch" }
  inputRef: RefObject<HTMLButtonElement | null>
  onKeyDown: (e: React.KeyboardEvent<any>) => void
}

export function CommandItemSwitch({
  field,
  inputRef,
  onKeyDown,
}: CommandItemSwitchProps) {
  const dispatch = useAppDispatch()
  const currentPage = useAppSelector(selectCurrentPage)
  const { handleCommonKeys } = useInlineInputKeys()

  const defaultChecked = !!(field as any).defaultChecked
  const raw = currentPage.formValues?.[field.id]
  const isOn = (raw ?? (defaultChecked ? "true" : "false")) === "true"

  const validationResult = useMemo(() => {
    return validateWithJsonSchema(isOn ? "true" : "false", field.validation)
  }, [isOn, field.validation])

  const toggle = () => {
    const next = (!isOn).toString()
    dispatch(setFormValue({ fieldId: field.id, value: next }))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (handleCommonKeys(e as any)) return
      onKeyDown(e)
      return
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      e.stopPropagation()
      toggle()
      return
    }

    if (handleCommonKeys(e as any)) return
  }

  return (
    <div className="command-item-content">
      <div className="command-item-select">
        <button
          ref={inputRef}
          type="button"
          role="switch"
          aria-checked={isOn}
          className="command-item-submit-button"
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
          onKeyDown={handleKeyDown}
        >
          {isOn ? "On" : "Off"}
        </button>
        <div className="validation-indicator">
          <span
            className={`validation-dot ${validationResult.isValid ? "valid" : "invalid"}`}
            title={validationResult.error || "Valid"}
          />
        </div>
      </div>
      <span cmdk-raycast-meta="">{field.label}</span>
    </div>
  )
}
