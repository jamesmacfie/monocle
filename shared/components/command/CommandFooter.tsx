import type { RefObject } from "react"
import type { Page, Suggestion } from "../../types/command"
import { Icon } from "../Icon"
import { CommandName } from "./CommandName"

export interface CommandFooterProps {
  currentPage: Page
  focusedSuggestion: Suggestion | undefined
  actionLabel: string
  inputRef: RefObject<HTMLInputElement | null>
  onActionSelect?: (id: string) => void
  onOpenActions?: (suggestion: Suggestion) => void
  actionsButtonRef?: RefObject<HTMLButtonElement>
}

export function CommandFooter({
  currentPage,
  focusedSuggestion,
  actionLabel,
  onOpenActions,
  actionsButtonRef,
}: CommandFooterProps) {
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
              <button cmdk-raycast-open-trigger="">
                {focusedSuggestion.type === "group" ? "Open" : actionLabel}
                <kbd>↵</kbd>
              </button>
            )}
            {(focusedSuggestion.type === "action" ||
              focusedSuggestion.type === "group") &&
              focusedSuggestion.actions?.length && (
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
