import * as React from "react"

const { useEffect, useCallback } = React

import { CommandPalette } from "../../shared/components/Command/index"
import { useGetCommands } from "../../shared/hooks/useGetCommands"
import { useGlobalKeybindings } from "../../shared/hooks/useGlobalKeybindings"
import { useSendMessage } from "../../shared/hooks/useSendMessage"
import { useAppDispatch } from "../../shared/store/hooks"

interface NewTabCommandPaletteProps {
  onClose?: () => void
  className?: string
  autoFocus?: boolean
}

export const NewTabCommandPalette: React.FC<NewTabCommandPaletteProps> = ({
  onClose,
  className,
  autoFocus = false,
}) => {
  const { data, fetchCommands, isLoading } = useGetCommands({ isNewTab: true })
  const sendMessage = useSendMessage()
  const _dispatch = useAppDispatch()
  const sendMessageWithNewTab = React.useCallback(
    (message: any) => {
      return sendMessage(message, { isNewTab: true })
    },
    [sendMessage],
  )

  // Enable global keybindings
  useGlobalKeybindings()

  // Fetch commands on initial render
  useEffect(() => {
    fetchCommands()
  }, [])

  // Execute command via background script (with parentNames support)
  const executeCommand = useCallback(
    async (
      id: string,
      formValues: Record<string, string | string[]>,
      navigateBack: boolean = true,
      parentNames?: string[],
    ) => {
      try {
        const response = await sendMessageWithNewTab({
          type: "execute-command",
          id,
          formValues,
          parentNames,
        })

        if (response.success) {
          // Refresh commands to update the UI (e.g., toggle button text)
          fetchCommands()

          // For settings-related commands, reload settings from storage
          if (id.includes("clock") || id.includes("settings")) {
            // Import loadSettings dynamically to avoid linter issues
            import("../../shared/store/slices/settings.slice").then(
              ({ loadSettings }) => {
                _dispatch(loadSettings())
              },
            )
          }

          if (navigateBack && onClose) {
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
    [onClose, sendMessageWithNewTab, fetchCommands],
  )

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose()
    }
  }, [onClose])

  return (
    <div className={className}>
      <CommandPalette
        items={data}
        executeCommand={executeCommand}
        close={handleClose}
        onRefreshCommands={fetchCommands}
        autoFocus={autoFocus}
        isLoading={isLoading}
      />
    </div>
  )
}
