import { useRef } from "react";
import type { CommandFooterProps } from "../../types/command";
import { Icon } from "../icon";
import { CommandName } from "./CommandName";

export function CommandFooter({
  currentPage,
  focusedSuggestion,
  actionLabel,
  inputRef,
  onActionSelect,
  onOpenActions,
  actionsButtonRef,
}: CommandFooterProps) {
  const handleActionsClick = () => {
    if (focusedSuggestion && onOpenActions) {
      onOpenActions(focusedSuggestion);
    }
  };

  return (
    <div cmdk-raycast-footer="">
      <div className="parent-command">
        {currentPage?.parent && (
          <>
            <Icon
              name={currentPage.parent.icon?.name}
              url={currentPage.parent.icon?.url}
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
              {focusedSuggestion.hasCommands ? "Open" : actionLabel}
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
  );
}
