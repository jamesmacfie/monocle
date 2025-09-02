import type { CommandFooterProps } from "../../types/command"
import { Icon } from "../Icon"
import { CommandName } from "./CommandName"

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
            <button cmdk-raycast-open-trigger="">
              {focusedSuggestion.isParentCommand ? "Open" : actionLabel}
              <kbd>↵</kbd>
            </button>
            {focusedSuggestion.actions?.length && (
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
