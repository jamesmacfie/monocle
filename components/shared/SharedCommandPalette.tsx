import * as React from "react";
const { useEffect, useCallback } = React;
import { CommandPalette } from "../../content/components/command";
import { useGetCommands } from "../../content/hooks/useGetCommands";
import { useSendMessage } from "../../content/hooks/useSendMessage";
import { useCommandPaletteState } from "../../content/hooks/useCommandPaletteState";
import { useGlobalKeybindings } from "../../content/hooks/useGlobalKeybindings";

interface SharedCommandPaletteProps {
  isAlwaysVisible?: boolean;
  onClose?: () => void;
  className?: string;
}

export const SharedCommandPalette: React.FC<SharedCommandPaletteProps> = ({
  isAlwaysVisible = false,
  onClose,
  className = ""
}) => {
  const { data, isLoading, fetchCommands } = useGetCommands();
  const sendMessage = useSendMessage();
  const { isOpen, hideUI } = useCommandPaletteState();

  // Enable global keybindings only if not always visible (content script mode)
  if (!isAlwaysVisible) {
    useGlobalKeybindings();
  }

  // Fetch commands on initial render
  useEffect(() => {
    fetchCommands();
  }, []);

  // For content script: fetch commands when UI is hidden to keep them up to date
  useEffect(() => {
    if (!isAlwaysVisible && !isOpen) {
      fetchCommands();
    }
  }, [isAlwaysVisible, isOpen, fetchCommands]);

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
          if (isAlwaysVisible) {
            // In new tab mode, don't close but maybe provide some feedback
          } else {
            hideUI(); // Close palette in content script mode
            onClose?.(); // Call additional close handler if provided
          }
        }

        // TODO: Handle errors
      } catch (error) {
        console.error(
          "[SharedCommandPalette] Error sending execute message:",
          error
        );
      }
    },
    [isAlwaysVisible, hideUI, onClose, sendMessage]
  );

  const handleClose = useCallback(() => {
    if (!isAlwaysVisible) {
      hideUI();
      onClose?.();
    }
    // In always visible mode, do nothing
  }, [isAlwaysVisible, hideUI, onClose]);

  // For always visible mode, always show. For content script mode, respect isOpen state
  const shouldShow = isAlwaysVisible || isOpen;

  return (
    <div className={className}>
      {shouldShow && (
        <CommandPalette
          items={data}
          executeCommand={executeCommand}
          close={handleClose}
          onRefreshCommands={fetchCommands}
        />
      )}
    </div>
  );
};