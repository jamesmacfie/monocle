import { Command, useCommandState } from "cmdk"
import { memo, type ReactNode, useEffect, useRef, useState } from "react"
import { match } from "ts-pattern"
import { usePermissionsGranted } from "../../../hooks/usePermissionsGranted"
import { useToast } from "../../../hooks/useToast"
import type {
  CalculationSuggestion,
  FormField,
  InputSuggestion,
  Suggestion,
} from "../../../types"
import { CommandItemAction } from "./CommandItemAction"
import { CommandItemCalculation } from "./CommandItemCalculation"
import { CommandItemColor } from "./CommandItemColor"
import { CommandItemDisplay } from "./CommandItemDisplay"
import { CommandItemInput } from "./CommandItemInput"
import { CommandItemMulti } from "./CommandItemMulti"
import { CommandItemSelect } from "./CommandItemSelect"
import { CommandItemSubmit } from "./CommandItemSubmit"
import { CommandItemSwitch } from "./CommandItemSwitch"
import { CommandItemTextarea } from "./CommandItemTextarea"
import { CommandItemTextList } from "./CommandItemTextList"

type TextListField = Extract<FormField, { type: "text-list" }>
type TextListSuggestion = InputSuggestion & { inputField: TextListField }

// Row contract: primitives and stable callbacks only. The component is
// memoized and rendered ~40x per page; any per-render object prop (like the
// whole page) silently defeats the memo and re-renders every row on every
// keystroke. Page-level data rows need is narrowed to hasParent, the row's
// own form value, and parent-owned callbacks.
export interface CommandItemProps {
  suggestion: Suggestion
  onSelect: (id: string) => void
  // Whether the current page is a child page (collapses "Parent > Child"
  // display names to just "Child").
  hasParent: boolean
  // Submit rows delegate validation up to CommandList, which owns the page's
  // form state.
  onSubmitForm: (id: string) => void
  // The stored form value for this row's input field (input rows only).
  formValue?: string | string[]
  onInputSubmit?: () => void // Called when input needs to submit form
}

interface Props extends CommandItemProps {
  children?: ReactNode
}

function CommandItemComponent({
  suggestion,
  onSelect,
  hasParent,
  onSubmitForm,
  formValue,
  onInputSubmit,
  children,
}: Props) {
  // All hooks must be called at the top level before any conditional returns
  const inputRef = useRef<HTMLInputElement | null>(null)
  const toast = useToast()
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const focusedValue = useCommandState((state) => state.value)
  const { isGrantedAllPermissions } = usePermissionsGranted(
    suggestion.permissions || [],
  )
  const submitRef = useRef<HTMLButtonElement | null>(null)
  const itemRef = useRef<HTMLDivElement | null>(null)

  // Computed values for effects (need these before effects)
  const type = suggestion.type
  const isInlineInput = type === "input"
  const _isSubmitButton = type === "submit"

  // Reset confirmation state when suggestion changes (navigation)
  useEffect(() => {
    setAwaitingConfirmation(false)
  }, [])

  // Clear confirmation when this item is no longer focused
  useEffect(() => {
    if (awaitingConfirmation && focusedValue !== suggestion.id) {
      setAwaitingConfirmation(false)
    }
  }, [focusedValue, suggestion.id, awaitingConfirmation])

  // Focus inline input when this item becomes focused
  useEffect(() => {
    if (isInlineInput && focusedValue === suggestion.id) {
      inputRef.current?.focus()
    }
  }, [focusedValue, suggestion.id, isInlineInput])

  // Focus submit button when this item becomes focused
  useEffect(() => {
    if (_isSubmitButton && focusedValue === suggestion.id) {
      submitRef.current?.focus()
    }
  }, [focusedValue, suggestion.id, _isSubmitButton])

  // Early return for special text-list input type
  if (
    suggestion.type === "input" &&
    suggestion.inputField?.type === "text-list"
  ) {
    const textListSuggestion = suggestion as TextListSuggestion
    return (
      <CommandItemTextList
        suggestion={textListSuggestion}
        storedValue={formValue}
        inputRef={inputRef}
        onInputSubmit={onInputSubmit}
      />
    )
  }

  const isDisplayOnly = type === "display"

  // Check if this command requires confirmation
  const requiresConfirmation =
    (type === "action" || type === "submit") &&
    suggestion.confirmAction === true

  const handleSelect = () => {
    // Do nothing for inline input or display rows
    if (isInlineInput || isDisplayOnly) {
      return
    }
    if (!isGrantedAllPermissions) {
      toast(
        "error",
        "Permissions required. Check the action menu to give these",
      )
      return
    }
    if (requiresConfirmation && !awaitingConfirmation) {
      // First press - show confirmation
      setAwaitingConfirmation(true)
    } else {
      // Second press (confirmation) or no confirmation needed - execute
      setAwaitingConfirmation(false)
      onSelect(suggestion.id)
    }
  }

  // Process the display name based on context
  // If we're viewing children of a parent, don't show parent names even for favorited commands
  const getContextualDisplayName = (name: string | string[]) => {
    // If we're viewing children of a parent and the name is an array (parent > child format),
    // only show the child name (first element) since the parent context is already clear
    if (hasParent && Array.isArray(name)) {
      return name[0] // Just show the command name, not "parent > child"
    }
    return name // Show as-is for top-level views
  }

  const displayName = awaitingConfirmation
    ? "Are you sure?"
    : getContextualDisplayName(suggestion.name)

  const inputField =
    suggestion.type === "input" ? suggestion.inputField : undefined
  const onInlineInputKeyDown = (e: React.KeyboardEvent<any>) => {
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      // Prevent native behavior and forward navigation to CMDK search input.
      e.preventDefault()
      e.stopPropagation()

      const searchInput = document.querySelector(
        "input[cmdk-input]",
      ) as HTMLInputElement | null

      // Check if this item is the first selectable in the list. If so and ArrowUp, focus search.
      if (e.key === "ArrowUp" && itemRef.current) {
        const list = itemRef.current.closest("[cmdk-list]")
        const firstItem = list?.querySelector(
          '[cmdk-item]:not([data-disabled="true"])',
        ) as HTMLElement | null
        if (firstItem === itemRef.current) {
          searchInput?.focus()
          return
        }
      }

      if (searchInput) {
        const ev = new KeyboardEvent("keydown", { key: e.key, bubbles: true })
        searchInput.dispatchEvent(ev)
      }
    }
  }

  const handleInputSubmit = () => {
    // Call parent callback to handle form submission (CommandList will validate)
    if (onInputSubmit) {
      onInputSubmit()
    }
  }

  return (
    <Command.Item
      ref={itemRef as any}
      // Keep value as the stable id so focus/selection logic based on ids
      // continues to work. Match keywords are no longer needed: filtering and
      // ranking are background-owned and cmdk runs with shouldFilter={false}.
      value={suggestion.id}
      onSelect={handleSelect}
    >
      {match(suggestion.type)
        .with("input", () =>
          match(inputField?.type)
            .with("text", () =>
              inputField && inputField.type === "text" ? (
                <CommandItemInput
                  field={inputField}
                  inputRef={inputRef}
                  onKeyDown={onInlineInputKeyDown}
                  onSubmit={handleInputSubmit}
                />
              ) : null,
            )
            .with("textarea", () =>
              inputField && inputField.type === "textarea" ? (
                <CommandItemTextarea
                  field={inputField}
                  inputRef={inputRef as any}
                  onSubmit={handleInputSubmit}
                />
              ) : null,
            )
            .with("select", () => (
              <CommandItemSelect
                field={inputField as any}
                inputRef={inputRef as any}
                onSubmit={handleInputSubmit}
              />
            ))
            .with("checkbox", "switch", () => (
              <CommandItemSwitch
                field={inputField as any}
                inputRef={inputRef as any}
                onKeyDown={onInlineInputKeyDown}
              />
            ))
            .with("multi", () => (
              <CommandItemMulti
                field={inputField as any}
                inputRef={inputRef as any}
                onKeyDown={onInlineInputKeyDown}
              />
            ))
            .with("color", () => (
              <CommandItemColor
                field={inputField as any}
                inputRef={inputRef as any}
                onKeyDown={onInlineInputKeyDown}
              />
            ))
            .otherwise(() => null),
        )
        .with("submit", () => (
          <CommandItemSubmit
            actionLabel={
              suggestion.type === "submit" ? suggestion.actionLabel : "Submit"
            }
            inputRef={submitRef}
            // Validation lives in CommandList, which owns the page's form
            // state; the row only reports which submit was pressed.
            onSubmit={() => onSubmitForm(suggestion.id)}
          />
        ))
        .with("display", () => (
          <CommandItemDisplay
            suggestion={suggestion}
            displayName={displayName}
          />
        ))
        .with("calculation", () => (
          <CommandItemCalculation
            suggestion={suggestion as CalculationSuggestion}
          />
        ))
        .otherwise(() => (
          <CommandItemAction
            suggestion={suggestion}
            displayName={displayName}
          />
        ))}
      {children}
    </Command.Item>
  )
}

// Memoized: background-owned search caps the mounted row count at ~50, so
// this is insurance against re-rendering every row body when unrelated parent
// state changes between keystrokes.
export const CommandItem = memo(CommandItemComponent)
