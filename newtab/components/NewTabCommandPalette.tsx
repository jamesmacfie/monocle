import * as React from "react"

const { useEffect, useCallback } = React

import { CommandPalette } from "../../shared/components/Command"
import { useGetCommands } from "../../shared/hooks/useGetCommands"
import { useGlobalKeybindings } from "../../shared/hooks/useGlobalKeybindings"
import { useSendMessage } from "../../shared/hooks/useSendMessage"

interface NewTabCommandPaletteProps {
  isAlwaysVisible?: boolean
  onClose?: () => void
  className?: string
  autoFocus?: boolean
}

export const NewTabCommandPalette: React.FC<NewTabCommandPaletteProps> = ({
  isAlwaysVisible = false,
  onClose,
  className = "",
  autoFocus = false,
}) => {
  const { data, fetchCommands } = useGetCommands()
  const sendMessage = useSendMessage()

  // Enable global keybindings
  useGlobalKeybindings()

  // Fetch commands on initial render
  useEffect(() => {
    fetchCommands()
  }, [])

  // Execute command via background script
  const executeCommand = useCallback(
    async (
      id: string,
      formValues: Record<string, string>,
      navigateBack: boolean = true,
    ) => {
      try {
        const response = await sendMessage({
          type: "execute-command",
          id,
          formValues,
        })

        if (response.success && navigateBack) {
          if (!isAlwaysVisible && onClose) {
            onClose() // Close palette on successful execution (only if closeable)
          }
        }

        // TODO: Handle errors
      } catch (error) {
        console.error(
          "[NewTabCommandPalette] Error sending execute message:",
          error,
        )
      }
    },
    [isAlwaysVisible, onClose, sendMessage],
  )

  const handleClose = useCallback(() => {
    if (!isAlwaysVisible && onClose) {
      onClose()
    }
    // In always visible mode, do nothing
  }, [isAlwaysVisible, onClose])

  return (
    <div className={className}>
      <CommandPalette
        items={data}
        executeCommand={executeCommand}
        close={handleClose}
        onRefreshCommands={fetchCommands}
        autoFocus={autoFocus}
      />
    </div>
  )
}
