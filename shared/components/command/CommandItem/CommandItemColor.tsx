import type { RefObject } from "react"
import { useMemo, useRef } from "react"
import { useInlineInputKeys } from "../../../hooks/useInlineInputKeys"
import { useAppDispatch, useAppSelector } from "../../../store/hooks"
import {
  selectCurrentPage,
  setFormValue,
} from "../../../store/slices/navigation.slice"
import type { FormField } from "../../../types"
import { validateWithJsonSchema } from "../../../utils/validation"

interface CommandItemColorProps {
  field: FormField & { type: "color" }
  inputRef: RefObject<HTMLButtonElement | null>
  onKeyDown: (e: React.KeyboardEvent<any>) => void
}

export function CommandItemColor({
  field,
  inputRef,
  onKeyDown,
}: CommandItemColorProps) {
  const dispatch = useAppDispatch()
  const currentPage = useAppSelector(selectCurrentPage)
  const colorInputRef = useRef<HTMLInputElement | null>(null)
  const { handleCommonKeys } = useInlineInputKeys()

  const defaultValue = field.defaultValue ?? "#000000"
  const currentValue =
    (currentPage.formValues?.[field.id] as string) ?? defaultValue

  const validationResult = useMemo(() => {
    return validateWithJsonSchema(currentValue, field.validation)
  }, [currentValue, field.validation])

  const openPicker = () => {
    colorInputRef.current?.click()
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
      openPicker()
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
          className="command-item-submit-button"
          onClick={(e) => {
            e.stopPropagation()
            openPicker()
          }}
          onKeyDown={handleKeyDown}
        >
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 4,
                background: currentValue,
                display: "inline-block",
                border: "1px solid var(--gray6)",
              }}
            />
            {currentValue}
          </span>
        </button>
        <input
          ref={colorInputRef}
          type="color"
          value={currentValue}
          style={{
            position: "absolute",
            opacity: 0,
            pointerEvents: "none",
            width: 0,
            height: 0,
          }}
          onChange={(e) => {
            const v = e.target.value
            dispatch(setFormValue({ fieldId: field.id, value: v }))
          }}
        />
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
