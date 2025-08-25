import * as React from "react";
const { useEffect, useCallback } = React;
import { CommandPalette } from "./command";
import { useGetCommands } from "../hooks/useGetCommands";
import { useSendMessage } from "../hooks/useSendMessage";
import { useCommandPaletteState } from "../../content/hooks/useCommandPaletteState";
import { useGlobalKeybindings } from "../../content/hooks/useGlobalKeybindings";

interface ContentCommandPaletteProps {
  onClose?: () => void;
}

export const ContentCommandPalette: React.FC<ContentCommandPaletteProps> = ({ onClose }) => {
  const { data, isLoading, fetchCommands } = useGetCommands();
  const { isOpen, hideUI } = useCommandPaletteState();
  const sendMessage = useSendMessage();

  // Enable global keybindings for content script
  useGlobalKeybindings();

  // Fetch commands on initial render
  useEffect(() => {
    fetchCommands();
  }, []);

  // Fetch commands when UI is hidden to keep them up to date
  useEffect(() => {
    if (!isOpen) {
      fetchCommands();
    }
  }, [isOpen, fetchCommands]);

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
          hideUI(); // Close palette in content script mode
          onClose?.(); // Call additional close handler if provided
        }

        // TODO: Handle errors
      } catch (error) {
        console.error(
          "[ContentCommandPalette] Error sending execute message:",
          error
        );
      }
    },
    [hideUI, onClose, sendMessage]
  );

  const handleClose = useCallback(() => {
    hideUI();
    onClose?.();
  }, [hideUI, onClose]);

  return (
    <>
      {isOpen && (
        <CommandPalette
          items={data}
          executeCommand={executeCommand}
          close={handleClose}
          onRefreshCommands={fetchCommands}
        />
      )}
    </>
  );
};