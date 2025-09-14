import type { RefObject } from "react"
import { useEffect, useMemo, useState } from "react"
import { useInlineInputKeys } from "../../../hooks/useInlineInputKeys"
import { useAppDispatch, useAppSelector } from "../../../store/hooks"
import {
  selectCurrentPage,
  setFormValue,
} from "../../../store/slices/navigation.slice"
import type { FormField } from "../../../types"
import { validateWithJsonSchema } from "../../../utils/validation"

interface CommandItemMultiProps {
  field: FormField & { type: "multi" }
  inputRef: RefObject<HTMLInputElement | null>
  onKeyDown: (e: React.KeyboardEvent<any>) => void
}

export function CommandItemMulti({
  field,
  inputRef,
  onKeyDown,
}: CommandItemMultiProps) {
  const dispatch = useAppDispatch()
  const currentPage = useAppSelector(selectCurrentPage)
  const { handleCommonKeys } = useInlineInputKeys()

  const defaultValues = field.defaultValue ?? []
  const raw = currentPage.formValues?.[field.id]
  const selected: string[] = Array.isArray(raw)
    ? raw
    : typeof raw === "string" && raw
      ? [raw]
      : defaultValues

  const validationResult = useMemo(() => {
    // Basic: if required, ensure at least one; skip JSON schema for arrays
    if (field.required && selected.length === 0) {
      return { isValid: false, error: "At least one option required" }
    }
    return validateWithJsonSchema(selected.join(","), field.validation)
  }, [selected, field.required, field.validation])

  const [focusIndex, setFocusIndex] = useState<number>(0)

  useEffect(() => {
    inputRef.current?.focus()
  }, [inputRef])

  // Move DOM focus to the currently focused chip when focusIndex changes
  useEffect(() => {
    inputRef.current?.focus()
  }, [focusIndex])

  const toggleValue = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value]
    dispatch(setFormValue({ fieldId: field.id, value: next }))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLFieldSetElement>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      if (handleCommonKeys(e as any)) return
      onKeyDown(e)
      return
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault()
      const next =
        (focusIndex - 1 + field.options.length) % field.options.length
      setFocusIndex(next)
      return
    }
    if (e.key === "ArrowRight") {
      e.preventDefault()
      const next = (focusIndex + 1) % field.options.length
      setFocusIndex(next)
      return
    }

    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      const value = field.options[focusIndex]?.value
      if (value) toggleValue(value)
      return
    }
    if (handleCommonKeys(e as any)) return
  }

  return (
    <div className="command-item-content">
      <fieldset className="command-item-select" onKeyDown={handleKeyDown}>
        <legend
          style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
        >
          {field.label}
        </legend>
        {field.options.map((opt, idx) => (
          <label
            key={opt.value}
            style={{ display: "inline-flex", alignItems: "center" }}
          >
            <input
              ref={idx === focusIndex ? (inputRef as any) : undefined}
              type="checkbox"
              name={`${field.id}-${opt.value}`}
              value={opt.value}
              checked={selected.includes(opt.value)}
              onChange={() => {
                setFocusIndex(idx)
                toggleValue(opt.value)
              }}
              tabIndex={idx === focusIndex ? 0 : -1}
              style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
            />
            <span
              className={`command-item-submit-button ${selected.includes(opt.value) ? "selected" : ""}`}
              onClick={(e) => {
                e.stopPropagation()
                setFocusIndex(idx)
                toggleValue(opt.value)
              }}
            >
              {opt.label}
            </span>
          </label>
        ))}
        <div className="validation-indicator">
          <span
            className={`validation-dot ${validationResult.isValid ? "valid" : "invalid"}`}
            title={validationResult.error || "Valid"}
          />
        </div>
      </fieldset>
      <span cmdk-raycast-meta="">{field.label}</span>
    </div>
  )
}
