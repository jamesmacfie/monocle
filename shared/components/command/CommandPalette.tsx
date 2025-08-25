import { useState, useRef, useEffect } from "react";
import { Command, useCommandState } from "cmdk";
import type { CommandData, Page } from "../../types/command";
import CommandUI from "../commandUI";
import { useCommandNavigation } from "../../hooks/useCommandNavigation";
import CopyToClipboardListener from "../../../content/components/copyToClipboard";
import NewTabListener from "../../../content/components/newTab";
import { useActionLabel } from "../../hooks/useActionLabel";
import { getDisplayName } from "./CommandName";
import { CommandHeader } from "./CommandHeader";
import { CommandList } from "./CommandList";
import { CommandFooter } from "./CommandFooter";
import { CommandActions } from "./CommandActions";
import type { CommandSuggestion } from "../../../types";

function CommandContent({
  pages,
  currentPage,
  inputRef,
  navigateBack,
  updateSearchValue,
  selectCommand,
  close,
  executeCommand,
  onOpenActions,
  onRefreshCommands,
}: {
  pages: Page[];
  currentPage: Page;
  inputRef: React.RefObject<HTMLInputElement>;
  navigateBack: () => void;
  updateSearchValue: (search: string) => void;
  selectCommand: (id: string) => void;
  close: () => void;
  executeCommand: (
    id: string,
    formValues: Record<string, string>,
    navigateBack?: boolean
  ) => Promise<void>;
  onOpenActions: (suggestion: CommandSuggestion) => void;
  onRefreshCommands: () => void;
}) {
  const focusedValue = useCommandState((state) => state.value);

  // Find the focused suggestion based on its value (name)
  const focusedSuggestion =
    (currentPage.commands.favorites || []).find(
      (item: CommandSuggestion) => getDisplayName(item.name) === focusedValue
    ) ||
    (currentPage.commands.recents || []).find(
      (item: CommandSuggestion) => getDisplayName(item.name) === focusedValue
    ) ||
    (currentPage.commands.suggestions || []).find(
      (item: CommandSuggestion) => getDisplayName(item.name) === focusedValue
    );

  const actionLabel = useActionLabel(currentPage);

  const handleActionSelect = async (actionId: string) => {
    // Execute the action using the same flow as regular commands
    await executeCommand(actionId, {}, false); // Don't navigate back for actions

    // Refresh commands after any action to ensure UI is up to date
    onRefreshCommands();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Alt key opens actions if there's a focused suggestion with actions
    if (e.key === "Alt" && focusedSuggestion?.actions?.length) {
      e.preventDefault();
      onOpenActions(focusedSuggestion);
      return;
    }

    // Escape goes to previous page
    if (e.key === "Escape" && pages.length > 1) {
      e.preventDefault();
      navigateBack();
      return;
    }

    // If on root and Escape, close
    if (e.key === "Escape" && pages.length === 1) {
      close();
      return;
    }

    // Backspace goes to previous page when search is empty
    const inputElement = e.currentTarget.querySelector(
      "input[cmdk-input]"
    ) as HTMLInputElement;
    const search = inputElement?.value || "";
    if (e.key === "Backspace" && !search && pages.length > 1) {
      e.preventDefault();
      navigateBack();
    }
  };

  return (
    <div onKeyDown={handleKeyDown}>
      <CommandHeader
        pages={pages}
        currentPage={currentPage}
        inputRef={inputRef}
        onNavigateBack={navigateBack}
        onSearchChange={updateSearchValue}
      />
      <CommandList currentPage={currentPage} onSelect={selectCommand} />
      <CommandFooter
        currentPage={currentPage}
        focusedSuggestion={focusedSuggestion}
        actionLabel={actionLabel}
        inputRef={inputRef}
        onActionSelect={handleActionSelect}
        onOpenActions={onOpenActions}
      />
    </div>
  );
}

interface Props {
  items: CommandData;
  executeCommand: (
    id: string,
    formValues: Record<string, string>,
    navigateBack?: boolean
  ) => Promise<void>;
  close: () => void;
  onRefreshCommands: () => void;
  autoFocus?: boolean;
}

export function CommandPalette({
  items,
  executeCommand,
  close,
  onRefreshCommands,
  autoFocus = false,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [actionsState, setActionsState] = useState<{
    open: boolean;
    suggestion: CommandSuggestion | null;
  }>({
    open: false,
    suggestion: null,
  });

  const {
    pages,
    currentPage,
    updateSearchValue,
    navigateBack,
    ui,
    selectCommand,
  } = useCommandNavigation(items, inputRef, executeCommand);

  // Focus input when mounted (with delay for new tab context)
  useEffect(() => {
    if (autoFocus) {
      // Add small delay to ensure DOM is ready, especially for new tab
      setTimeout(() => {
        inputRef?.current?.focus();
      }, 100);
    } else {
      inputRef?.current?.focus();
    }
  }, [autoFocus]);

  const handleOpenActions = (suggestion: CommandSuggestion) => {
    setActionsState({
      open: true,
      suggestion,
    });
  };

  const handleCloseActions = () => {
    setActionsState({
      open: false,
      suggestion: null,
    });
  };

  const handleActionSelect = async (actionId: string) => {
    // Execute the action using the same flow as regular commands
    await executeCommand(actionId, {}, false); // Don't navigate back for actions

    // Refresh commands after any action to ensure UI is up to date
    onRefreshCommands();
  };

  return (
    <div className="raycast">
      <CopyToClipboardListener />
      <NewTabListener />
      {ui ? (
        <Command>
          <CommandUI
            currentPage={currentPage}
            ui={ui}
            onBack={navigateBack}
            onEscape={navigateBack}
            onExecute={(id, values) => executeCommand(id, values, false)}
          />
        </Command>
      ) : (
        <>
          <Command>
            <CommandContent
              pages={pages}
              currentPage={currentPage}
              inputRef={inputRef}
              navigateBack={navigateBack}
              updateSearchValue={updateSearchValue}
              selectCommand={selectCommand}
              close={close}
              executeCommand={executeCommand}
              onOpenActions={handleOpenActions}
              onRefreshCommands={onRefreshCommands}
            />
          </Command>
          {actionsState.suggestion && (
            <CommandActions
              open={actionsState.open}
              selectedValue={getDisplayName(actionsState.suggestion.name)}
              inputRef={inputRef}
              actions={actionsState.suggestion.actions}
              onActionSelect={handleActionSelect}
              onClose={handleCloseActions}
            />
          )}
        </>
      )}
    </div>
  );
}
