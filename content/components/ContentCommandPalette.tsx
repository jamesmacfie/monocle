import * as React from "react"

const { useEffect, useCallback } = React

import { CommandPalette } from "../../shared/components/Command"
import { ToastContainer } from "../../shared/components/ToastContainer"
import { useCommandPaletteStateRedux } from "../../shared/hooks/useCommandPaletteStateRedux"
import { useGetCommands } from "../../shared/hooks/useGetCommands"
import { useGlobalKeybindings } from "../../shared/hooks/useGlobalKeybindings"
import { useSendMessage } from "../../shared/hooks/useSendMessage"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import {
  loadPermissions,
  loadSettings,
  selectThemeMode,
} from "../../shared/store/slices/settings.slice"
import {
  applyThemeClass,
  setupSystemThemeListener,
} from "../../shared/utils/theme"

// Store is provided by ContentCommandPaletteWithState at the root

interface ContentCommandPaletteProps {
  onClose?: () => void
}

export const ContentCommandPalette: React.FC<ContentCommandPaletteProps> = ({
  onClose,
}) => {
  const { data, fetchCommands } = useGetCommands()
  const { isOpen, hideUI } = useCommandPaletteStateRedux()
  const sendMessage = useSendMessage()
  const dispatch = useAppDispatch()
  const themeMode = useAppSelector(selectThemeMode)

  // Enable global keybindings for content script
  useGlobalKeybindings()

  // Load permissions, settings and fetch commands on initial render
  useEffect(() => {
    dispatch(loadPermissions())
    dispatch(loadSettings())
    fetchCommands()
  }, [])

  // Apply theme to shadow DOM host
  useEffect(() => {
    // Find the shadow root's host element
    const shadowHost = document.getElementById("extension-root")
    if (shadowHost?.shadowRoot) {
      applyThemeClass(shadowHost.shadowRoot, themeMode)
    }
  }, [themeMode])

  // Setup system theme listener
  useEffect(() => {
    if (themeMode === "system") {
      return setupSystemThemeListener(() => {
        // Re-apply theme when system preference changes
        const shadowHost = document.getElementById("extension-root")
        if (shadowHost?.shadowRoot) {
          applyThemeClass(shadowHost.shadowRoot, themeMode)
        }
      })
    }
  }, [themeMode])

  // Fetch commands when UI is hidden to keep them up to date
  useEffect(() => {
    if (!isOpen) {
      fetchCommands()
    }
  }, [isOpen, fetchCommands])

  // Execute command via background script (with parentNames support)
  const executeCommand = useCallback(
    async (
      id: string,
      formValues: Record<string, string | string[]>,
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

  return (
    <>
      {isOpen && (
        <>
          <div className="command-palette-overlay" onClick={handleClose} />
          <CommandPalette
            items={data}
            executeCommand={executeCommand}
            close={handleClose}
            onRefreshCommands={fetchCommands}
          />
        </>
      )}
      <ToastContainer />
    </>
  )
}
