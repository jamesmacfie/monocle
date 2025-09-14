import { Command, useCommandState } from "cmdk"
import { type ReactNode, useEffect, useRef, useState } from "react"
import { match } from "ts-pattern"
import { usePermissionsGranted } from "../../../hooks/usePermissionsGranted"
import { useToast } from "../../../hooks/useToast"
import type { Page } from "../../../store/slices/navigation.slice"
import type { Suggestion } from "../../../types/command"
import {
  collectInputFieldsFromSuggestions,
  validateFormValues,
} from "../../../utils/forms"
import { CommandItemAction } from "./CommandItemAction"
import { CommandItemColor } from "./CommandItemColor"
import { CommandItemDisplay } from "./CommandItemDisplay"
import { CommandItemInput } from "./CommandItemInput"
import { CommandItemMulti } from "./CommandItemMulti"
import { CommandItemSelect } from "./CommandItemSelect"
import { CommandItemSubmit } from "./CommandItemSubmit"
import { CommandItemSwitch } from "./CommandItemSwitch"

export interface CommandItemProps {
  suggestion: Suggestion
  onSelect: (id: string) => void
  currentPage: Page
  onInputSubmit?: () => void // Called when input needs to submit form
}

interface Props extends CommandItemProps {
  children?: ReactNode
}

export function CommandItem({
  suggestion,
  onSelect,
  currentPage,
  onInputSubmit,
  children,
}: Props) {
  const toast = useToast()
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false)
  const focusedValue = useCommandState((state) => state.value)
  const { isGrantedAllPermissions } = usePermissionsGranted(
    suggestion.permissions || [],
  )
  const inputRef = useRef<HTMLInputElement | null>(null)
  const submitRef = useRef<HTMLButtonElement | null>(null)
  const itemRef = useRef<HTMLDivElement | null>(null)

  const type = suggestion.type
  const isInlineInput = type === "input"
  const isDisplayOnly = type === "display"
  const _isSubmitButton = type === "submit"

  // Check if this command requires confirmation
  const requiresConfirmation =
    (type === "action" || type === "submit") &&
    suggestion.confirmAction === true

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
    if (currentPage.parent && Array.isArray(name)) {
      return name[0] // Just show the command name, not "parent > child"
    }
    return name // Show as-is for top-level views
  }

  const displayName = awaitingConfirmation
    ? "Are you sure?"
    : getContextualDisplayName(suggestion.name)

  // Build rich keywords to improve fuzzy search ranking without changing stable value (id)
  const primaryNameToken = Array.isArray(suggestion.name)
    ? suggestion.name[0]
    : suggestion.name
  const ancestorNameTokens = Array.isArray(suggestion.name)
    ? suggestion.name.slice(1)
    : []
  const descriptionToken =
    typeof suggestion.description === "string" ? suggestion.description : undefined
  const keybindingToken =
    typeof suggestion.keybinding === "string" ? suggestion.keybinding : undefined
  const mergedKeywords = [
    // Put primary name first to give it highest weight in custom filter
    primaryNameToken,
    // Include any ancestor/breadcrumb names for deep search context
    ...ancestorNameTokens,
    // Existing explicit keywords from the command definition
    ...(suggestion.keywords || []),
    // Description can help match URLs or extra context (e.g., bookmarks)
    descriptionToken,
    // Keybinding text, and the stable id as a last‑resort match target
    keybindingToken,
    suggestion.id,
  ].filter(Boolean) as string[]

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
      // Keep value as the stable id so focus/selection logic based on ids continues to work
      value={suggestion.id}
      // Provide a richer set of keywords for the fuzzy filter to score against
      keywords={mergedKeywords}
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
            onSubmit={() => {
              // Validate all inline inputs on the current page before submitting
              const fields = collectInputFieldsFromSuggestions(
                currentPage.commands.suggestions || [],
              )
              const result = validateFormValues(
                currentPage.formValues || {},
                fields,
              )
              if (!result.isValid) {
                toast("error", "Form is invalid. Check inputs.")
                return
              }
              onSelect(suggestion.id)
            }}
          />
        ))
        .with("display", () => (
          <CommandItemDisplay
            suggestion={suggestion}
            displayName={displayName}
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
