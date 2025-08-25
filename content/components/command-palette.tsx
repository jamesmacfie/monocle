import * as React from "react";
const { useEffect, useCallback } = React;
import { CommandPalette } from "./command";
import type { DialogProps } from "@radix-ui/react-dialog";
import { useCommandPaletteState } from "../hooks/useCommandPaletteState";
import { useSendMessage } from "../hooks/useSendMessage";
import { useGetCommands } from "../hooks/useGetCommands";
import { useGlobalKeybindings } from "../hooks/useGlobalKeybindings";

interface Props extends DialogProps {
  onClose?: () => void; // Add an onClose prop
}

export const CommandPaletteUI: React.FC<Props> = ({ onClose }) => {
  const { data, isLoading, fetchCommands } = useGetCommands();
  const { isOpen, hideUI } = useCommandPaletteState();
  const sendMessage = useSendMessage();

  // Enable global keybindings - must be outside conditional rendering
  useGlobalKeybindings();

  // Fetch commands on initial render
  useEffect(() => {
    fetchCommands();
  }, []);

  useEffect(() => {
    // Fetch commands when UI is hidden so that the commands are up to date
    // when next loaded
    if (!isOpen) {
      fetchCommands();
    }
  }, [isOpen]);

  // Execute command via background script
  const executeCommand = useCallback(
    async (
      id: string,
      formValues: Record<string, string>,
      navigateBack: boolean = true
    ) => {
      try {
        const response = await sendMessage({
          type: "execute-command",
          id,
          formValues,
        });

        if (response.success && navigateBack) {
          hideUI(); // Close palette on successful execution
        }

        // TODO: Handle errors
      } catch (error) {
        console.error(
          "[CommandPaletteUI] Error sending execute message:",
          error
        );
      }
    },
    [hideUI]
  );

  return (
    <>
      {isOpen && (
        <CommandPalette
          items={data}
          executeCommand={executeCommand}
          close={hideUI}
          onRefreshCommands={fetchCommands}
        />
      )}
    </>
  );
};
