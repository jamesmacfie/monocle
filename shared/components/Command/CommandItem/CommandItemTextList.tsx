import { Command, useCommandState } from "cmdk"
import type { MutableRefObject, RefObject } from "react"
import { Fragment, useCallback, useEffect, useMemo, useRef } from "react"
import type { FormField, InputSuggestion } from "../../../../shared/types"
import { useInlineInputKeys } from "../../../hooks/useInlineInputKeys"
import { useToast } from "../../../hooks/useToast"
import { useAppDispatch } from "../../../store/hooks"
import type { Page } from "../../../store/slices/navigation.slice"
import { setFormValue } from "../../../store/slices/navigation.slice"
import { validateWithJsonSchema } from "../../../utils/validation"

type TextListField = Extract<FormField, { type: "text-list" }>

interface CommandItemTextListProps {
  suggestion: InputSuggestion & { inputField: TextListField }
  currentPage: Page
  inputRef: RefObject<HTMLInputElement | null>
  onInputSubmit?: () => void
}

const arraysEqual = (a: string[], b: string[]) => {
  if (a.length !== b.length) return false
  return a.every((value, index) => value === b[index])
}

const normalizeList = (values: readonly string[]): string[] => {
  const next = values.map((value) => value ?? "")

  // Remove duplicate trailing empty entries, keeping at most one placeholder at the end
  while (next.length > 1) {
    const last = next[next.length - 1]
    const prev = next[next.length - 2]
    if (last.trim() === "" && prev.trim() === "") {
      next.pop()
      continue
    }
    break
  }

  if (next.length === 0 || next[next.length - 1].trim() !== "") {
    next.push("")
  }

  return next
}

export function CommandItemTextList({
  suggestion,
  currentPage,
  inputRef,
  onInputSubmit,
}: CommandItemTextListProps) {
  const dispatch = useAppDispatch()
  const { handleCommonKeys } = useInlineInputKeys()
  const focusedValue = useCommandState((state) => state.value)
  const toast = useToast()

  const listId = suggestion.inputField.id
  const stored = currentPage.formValues?.[listId]

  const baseValues = useMemo(() => {
    if (Array.isArray(stored)) {
      return stored
    }

    if (typeof stored === "string" && stored.length > 0) {
      return stored.split(",")
    }

    return suggestion.inputField.defaultValue || []
  }, [stored, suggestion.inputField.defaultValue])

  const normalizedValues = useMemo(
    () => normalizeList(baseValues),
    [baseValues],
  )

  useEffect(() => {
    if (!arraysEqual(baseValues, normalizedValues)) {
      dispatch(setFormValue({ fieldId: listId, value: normalizedValues }))
    }
  }, [baseValues, normalizedValues, dispatch, listId])

  const values = normalizedValues

  const listRefs = useRef<Array<HTMLInputElement | null>>([])
  const pendingFocusIndex = useRef<number | null>(null)

  const focusRow = useCallback(
    (targetIndex: number, options?: { force?: boolean }) => {
      const { force = false } = options || {}
      const clampedIndex = Math.max(0, Math.min(targetIndex, values.length - 1))
      pendingFocusIndex.current = clampedIndex
      const target = listRefs.current[clampedIndex]
      if (target) {
        requestAnimationFrame(() => {
          if (force || document.activeElement !== target) {
            target.focus()
            const length = target.value.length
            target.setSelectionRange(length, length)
          }
          pendingFocusIndex.current = null
        })
      }
    },
    [values.length],
  )

  useEffect(() => {
    listRefs.current = listRefs.current.slice(0, values.length)
  }, [values.length])

  useEffect(() => {
    if (pendingFocusIndex.current === null) return
    const desiredIndex = Math.max(
      0,
      Math.min(pendingFocusIndex.current, values.length - 1),
    )
    const target = listRefs.current[desiredIndex]
    if (!target) {
      return
    }
    pendingFocusIndex.current = null
    requestAnimationFrame(() => {
      target.focus()
      const length = target.value.length
      target.setSelectionRange(length, length)
    })
  }, [values])

  const setRowRef = (index: number) => (el: HTMLInputElement | null) => {
    listRefs.current[index] = el
    if (index === 0 && inputRef) {
      ;(inputRef as MutableRefObject<HTMLInputElement | null>).current = el
    }
    if (el && focusedValue === `${suggestion.id}__${index}`) {
      requestAnimationFrame(() => {
        if (document.activeElement !== el) {
          el.focus()
          const length = el.value.length
          el.setSelectionRange(length, length)
        }
      })
    }
  }

  const applyValues = (next: string[], focusIndex?: number) => {
    const normalized = normalizeList(next)
    if (!arraysEqual(values, normalized)) {
      dispatch(setFormValue({ fieldId: listId, value: normalized }))
    }
    if (typeof focusIndex === "number") {
      focusRow(focusIndex, { force: true })
    }
  }

  const handleChange =
    (index: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = values.map((value, idx) =>
        idx === index ? e.target.value : value,
      )
      applyValues(next, index)
    }

  const handleRemoveRow = (index: number) => {
    if (values.length <= 1) {
      return
    }
    const removedValue = values[index]
    const next = values.filter((_, idx) => idx !== index)
    const focusIndex = Math.max(index - 1, 0)
    applyValues(next, focusIndex)
    toast(
      "info",
      removedValue && removedValue.trim().length > 0
        ? `Removed pattern "${removedValue.trim()}"`
        : "Removed empty URL pattern",
    )
  }

  const handleRowKeyDown = (index: number) => {
    return (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "ArrowUp") {
        if (index > 0) {
          e.preventDefault()
          e.stopPropagation()
          focusRow(index - 1, { force: true })
          return
        }
        if (handleCommonKeys(e as any)) return
        return
      }

      if (e.key === "ArrowDown") {
        const nextIndex = index + 1
        if (nextIndex < values.length) {
          e.preventDefault()
          e.stopPropagation()
          focusRow(nextIndex, { force: true })
          return
        }
        if (handleCommonKeys(e as any)) return
        return
      }

      if (
        e.key === "Backspace" &&
        values[index].trim() === "" &&
        values.length > 1
      ) {
        e.preventDefault()
        e.stopPropagation()
        handleRemoveRow(index)
        return
      }

      if (e.key === "Enter" && onInputSubmit) {
        e.preventDefault()
        e.stopPropagation()
        onInputSubmit()
        return
      }

      if (handleCommonKeys(e as any)) {
        return
      }
    }
  }

  const nonEmptyValues = useMemo(
    () => values.filter((value) => value.trim().length > 0),
    [values],
  )

  const validationResult = useMemo(() => {
    if (suggestion.inputField.required && nonEmptyValues.length === 0) {
      return { isValid: false, error: "At least one URL is required" }
    }
    return validateWithJsonSchema(
      nonEmptyValues.join(","),
      suggestion.inputField.validation,
    )
  }, [
    suggestion.inputField.required,
    suggestion.inputField.validation,
    nonEmptyValues,
  ])

  useEffect(() => {
    if (!focusedValue) return
    const prefix = `${suggestion.id}__`
    if (!focusedValue.startsWith(prefix)) return
    const index = Number.parseInt(focusedValue.slice(prefix.length), 10)
    if (Number.isNaN(index)) return
    focusRow(index, { force: true })
  }, [focusedValue, suggestion.id, focusRow])

  return (
    <Fragment>
      {values.map((value, index) => {
        const baseName = Array.isArray(suggestion.name)
          ? suggestion.name.join(" ")
          : suggestion.name

        const keywordTokens = [
          baseName,
          suggestion.id,
          suggestion.inputField.label,
          value,
          ...(suggestion.keywords || []),
        ]

        const rowId = `${suggestion.id}__${index}`

        return (
          <Command.Item
            key={rowId}
            value={rowId}
            keywords={keywordTokens.filter(Boolean) as string[]}
            data-disabled={false}
            data-inline-input
            onSelect={() => {}}
          >
            <div className="command-item-content">
              <div className="command-item-inline-input">
                <input
                  ref={setRowRef(index)}
                  type="text"
                  value={value}
                  placeholder={suggestion.inputField.placeholder}
                  onChange={handleChange(index)}
                  onKeyDown={handleRowKeyDown(index)}
                />
                {index === 0 && (
                  <div className="validation-indicator">
                    <span
                      className={`validation-dot ${
                        validationResult.isValid ? "valid" : "invalid"
                      }`}
                      title={validationResult.error || "Valid"}
                    />
                  </div>
                )}
              </div>
              <span cmdk-raycast-meta="">
                {index === 0 ? suggestion.inputField.label : ""}
              </span>
            </div>
          </Command.Item>
        )
      })}
    </Fragment>
  )
}
