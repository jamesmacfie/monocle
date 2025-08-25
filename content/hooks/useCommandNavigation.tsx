import { useEffect } from "react";

import { useRef } from "react";

import { useState } from "react";

import type { RefObject } from "react";
import type { CommandSuggestion, CommandSuggesetionUI } from "../../types";
import { useSendMessage } from "./useSendMessage";
import { getDisplayName } from "../components/command/CommandName";

// Enhanced Page type that includes search value
export type Page = {
  id: string;
  commands: {
    favorites: CommandSuggestion[];
    recents: CommandSuggestion[];
    suggestions: CommandSuggestion[];
  };
  searchValue: string;
  parent?: CommandSuggestion;
};

export type UI = {
  id: string;
  name: string;
  ui: CommandSuggesetionUI[];
};

export function useCommandNavigation(
  initialCommands: {
    favorites: CommandSuggestion[];
    recents: CommandSuggestion[];
    suggestions: CommandSuggestion[];
  },
  inputRef: RefObject<HTMLInputElement>,
  executeCommand: (
    id: string,
    formValues: Record<string, string>,
    navigateBack?: boolean
  ) => Promise<void>
) {
  const sendMessage = useSendMessage();
  const [pages, setPages] = useState<Page[]>([
    { id: "root", commands: initialCommands, searchValue: "" },
  ]);
  const currentPage = pages[pages.length - 1];

  const [ui, setUi] = useState<UI | null>(null);

  // Use this ref to prevent loops
  const ignoreSearchUpdate = useRef(false);
  // Track previous page to handle search restoration
  const prevPageRef = useRef<string | null>(null);

  // Update root page commands when initialCommands change
  useEffect(() => {
    const newPages = [...pages];
    newPages[0] = { ...newPages[0], commands: initialCommands };
    setPages(newPages);
  }, [initialCommands]);

  // Handle page change to restore previous search
  useEffect(() => {
    if (prevPageRef.current !== currentPage.id) {
      prevPageRef.current = currentPage.id;

      // When restoring a page, set the search value based on stored value
      const inputElement = inputRef.current;
      if (inputElement && inputElement.value !== currentPage.searchValue) {
        ignoreSearchUpdate.current = true;

        // Update the input value directly
        inputElement.value = currentPage.searchValue;
        // Dispatch an input event to trigger CMDK's search update
        const event = new Event("input", { bubbles: true });
        inputElement.dispatchEvent(event);
      }
    }
  }, [currentPage.id, currentPage.searchValue, inputRef]);

  const updateSearchValue = (search: string) => {
    // Skip updating pages if this was triggered by a page change
    if (ignoreSearchUpdate.current) {
      ignoreSearchUpdate.current = false;
      return;
    }

    // Update the current page's search value
    setPages((currentPages) => {
      const newPages = [...currentPages];
      newPages[newPages.length - 1] = {
        ...newPages[newPages.length - 1],
        searchValue: search,
      };
      return newPages;
    });
  };

  const navigateTo = async (id: string) => {
    try {
      const response = await sendMessage({
        type: "get-children-commands",
        id,
      });

      if (response.children && response.children.length > 0) {
        // Find the parent command from current page to store its info
        const parentCommand =
          (currentPage.commands.favorites || []).find(
            (command) => command.id === id
          ) ||
          (currentPage.commands.recents || []).find(
            (command) => command.id === id
          ) ||
          (currentPage.commands.suggestions || []).find(
            (command) => command.id === id
          );

        // Navigate to new page by adding to pages array with empty search
        setPages([
          ...pages,
          {
            id,
            commands: {
              favorites: [],
              recents: [],
              suggestions: response.children,
            },
            searchValue: "", // Start with empty search for new page
            parent: parentCommand,
          },
        ]);

        // We need to clear the search in CMDK
        const inputElement = inputRef.current;
        if (inputElement) {
          inputElement.value = "";
          // Dispatch an input event to trigger CMDK's search update
          const event = new Event("input", { bubbles: true });
          inputElement.dispatchEvent(event);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("❌ Error fetching command children:", error);
      return false;
    }
  };

  const navigateBack = () => {
    if (ui) {
      // If UI is showing, go back to command view
      setUi(null);
      // Focus the input after a short delay to ensure the DOM has updated
      setTimeout(() => inputRef.current?.focus(), 0);
      return true;
    }

    if (pages.length <= 1) return false;

    // Get the previous page before modifying state
    const previousPage = pages[pages.length - 2];
    const previousSearchValue = previousPage.searchValue;

    // Set flag to avoid update loops
    ignoreSearchUpdate.current = true;

    // Remove the current page to go back
    setPages(pages.slice(0, -1));

    // Need to wait for state update to complete
    setTimeout(() => {
      // Now that React has updated, we can update the search value
      if (inputRef.current) {
        // Reset this flag only after our manual updates are done
        inputRef.current.value = previousSearchValue;

        // Trigger a synthetic input event to update CMDK's internal state
        const event = new Event("input", { bubbles: true });
        inputRef.current.dispatchEvent(event);

        // Focus and select text
        inputRef.current.focus();
        inputRef.current.setSelectionRange(0, previousSearchValue.length);
      }

      // Reset the flag when everything is done
      ignoreSearchUpdate.current = false;
    }, 0);

    return true;
  };

  const selectCommand = async (id: string) => {
    // Find the selected command from current page
    const selectedCommand =
      (currentPage.commands.favorites || []).find(
        (command) => command.id === id
      ) ||
      (currentPage.commands.recents || []).find(
        (command) => command.id === id
      ) ||
      (currentPage.commands.suggestions || []).find(
        (command) => command.id === id
      );

    if (!selectedCommand) {
      console.error("⚠️ Selected command not found for id:", id);
      return;
    }

    if (selectedCommand.hasCommands) {
      // It's a parent command, attempt to navigate to it
      await navigateTo(id);
    } else if (selectedCommand.ui) {
      // It's a command with UI, show the UI
      const displayName = getDisplayName(selectedCommand.name);

      setUi({
        id: selectedCommand.id,
        name: displayName,
        ui: selectedCommand.ui,
      });
    } else {
      // It's a leaf command, execute it
      await executeCommand(selectedCommand.id, {});
    }
  };

  return {
    pages,
    currentPage,
    updateSearchValue,
    navigateTo,
    navigateBack,
    ui,
    selectCommand,
  };
}
