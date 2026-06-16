import type { RefObject } from "react"
import type { Page } from "../../store/slices/navigation.slice"
import type { Suggestion } from "../../types"
import { Icon } from "../Icon"
import { canOpenActionMenu } from "./actionMenu"
import { CommandName } from "./CommandName"

export interface CommandFooterProps {
  currentPage: Page
  focusedSuggestion: Suggestion | undefined
  actionLabel: string
  inputRef: RefObject<HTMLInputElement | null>
  onSelect?: (id: string) => void
  onOpenActions?: (suggestion: Suggestion) => void
  actionsButtonRef?: RefObject<HTMLButtonElement>
}

export function CommandFooter({
  currentPage,
  focusedSuggestion,
  actionLabel,
  inputRef,
  onSelect,
  onOpenActions,
  actionsButtonRef,
}: CommandFooterProps) {
  // Clicking the primary button mirrors pressing Enter on the focused row
  const handlePrimaryClick = () => {
    if (focusedSuggestion && onSelect) {
      onSelect(focusedSuggestion.id)
      // Return focus to the search input so keyboard flow keeps working
      inputRef?.current?.focus()
    }
  }

  const handleActionsClick = () => {
    if (focusedSuggestion && onOpenActions) {
      onOpenActions(focusedSuggestion)
    }
  }

  return (
    <div cmdk-raycast-footer="">
      <div className="parent-command">
        {currentPage?.parent && (
          <>
            <Icon
              icon={currentPage.parent.icon}
              color={currentPage.parent.color}
            />
            <CommandName name={currentPage.parent.name} />
          </>
        )}
      </div>

      <div className="footer-actions">
        {focusedSuggestion && (
          <>
            {(focusedSuggestion.type === "group" || actionLabel) && (
              <button cmdk-raycast-open-trigger="" onClick={handlePrimaryClick}>
                {focusedSuggestion.type === "group" ? "Open" : actionLabel}
                <kbd>↵</kbd>
              </button>
            )}
            {canOpenActionMenu(focusedSuggestion) && (
              <>
                <hr />
                <button
                  ref={actionsButtonRef}
                  cmdk-raycast-subcommand-trigger=""
                  onClick={handleActionsClick}
                >
                  Actions
                  <kbd>Alt</kbd>
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
