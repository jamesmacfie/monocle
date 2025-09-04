import * as React from "react"
import { Provider } from "react-redux"

const { useEffect, useCallback } = React

import { CommandPalette } from "../../shared/components/Command/index"
import { useGetCommands } from "../../shared/hooks/useGetCommands"
import { useGlobalKeybindings } from "../../shared/hooks/useGlobalKeybindings"
import { useSendMessage } from "../../shared/hooks/useSendMessage"
import { createNavigationStore } from "../../shared/store"

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
  const { data, fetchCommands, isLoading } = useGetCommands()
  const sendMessage = useSendMessage()

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
      formValues: Record<string, string>,
      navigateBack: boolean = true,
      parentNames?: string[],
    ) => {
      try {
        const response = await sendMessage({
          type: "execute-command",
          id,
          formValues,
          parentNames,
        })

        if (response.success && navigateBack) {
          if (onClose) {
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
    [onClose, sendMessage],
  )

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose()
    }
  }, [onClose])

  // Create Redux store with current data
  const store = React.useMemo(() => {
    if (!data.favorites && !data.recents && !data.suggestions) {
      return null
    }
    return createNavigationStore(data, sendMessage)
  }, [data, sendMessage])

  if (!store) {
    return <div className={className}>Loading...</div>
  }

  return (
    <div className={className}>
      <Provider store={store}>
        <CommandPalette
          items={data}
          executeCommand={executeCommand}
          close={handleClose}
          onRefreshCommands={fetchCommands}
          autoFocus={autoFocus}
          isLoading={isLoading}
        />
      </Provider>
    </div>
  )
}
