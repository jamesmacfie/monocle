import * as React from "react"
import { Provider } from "react-redux"

const { useEffect, useCallback } = React

import { CommandPalette } from "../../shared/components/Command"
import { ToastContainer } from "../../shared/components/ToastContainer"
import { useCommandPaletteStateRedux } from "../../shared/hooks/useCommandPaletteStateRedux"
import { useGetCommands } from "../../shared/hooks/useGetCommands"
import { useGlobalKeybindings } from "../../shared/hooks/useGlobalKeybindings"
import { useSendMessage } from "../../shared/hooks/useSendMessage"
import { createNavigationStore } from "../../shared/store"

interface ContentCommandPaletteProps {
  onClose?: () => void
}

export const ContentCommandPalette: React.FC<ContentCommandPaletteProps> = ({
  onClose,
}) => {
  const { data, fetchCommands } = useGetCommands()
  const { isOpen, hideUI } = useCommandPaletteStateRedux()
  const sendMessage = useSendMessage()

  // Enable global keybindings for content script
  useGlobalKeybindings()

  // Fetch commands on initial render
  useEffect(() => {
    fetchCommands()
  }, [])

  // Fetch commands when UI is hidden to keep them up to date
  useEffect(() => {
    if (!isOpen) {
      fetchCommands()
    }
  }, [isOpen, fetchCommands])

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
          hideUI() // Close palette in content script mode
          onClose?.() // Call additional close handler if provided
        }

        // TODO: Handle errors
      } catch (error) {
        console.error(
          "[ContentCommandPalette] Error sending execute message:",
          error,
        )
      }
    },
    [hideUI, onClose, sendMessage],
  )

  const handleClose = useCallback(() => {
    hideUI()
    onClose?.()
  }, [hideUI, onClose])

  // Create Redux store with current data
  const store = React.useMemo(() => {
    if (!data.favorites && !data.recents && !data.suggestions) {
      return null
    }
    return createNavigationStore(data, sendMessage)
  }, [data, sendMessage])

  return (
    <>
      {isOpen && store && (
        <Provider store={store}>
          <CommandPalette
            items={data}
            executeCommand={executeCommand}
            close={handleClose}
            onRefreshCommands={fetchCommands}
          />
        </Provider>
      )}
      <p>test</p>
      <ToastContainer />
    </>
  )
}
