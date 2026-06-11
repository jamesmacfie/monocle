import * as React from "react"
import type { CommandExecutionScope } from "../../shared/types"

const { useEffect, useCallback } = React

import { CommandPalette } from "../../shared/components/Command"
import CopyToClipboardListener from "../../shared/components/Listeners/CopyToClipboardListener"
import NewTabListener from "../../shared/components/Listeners/NewTabListener"
import ScreenshotListener from "../../shared/components/Listeners/ScreenshotListener"
import ScrollListener from "../../shared/components/Listeners/ScrollListener"
import { ToastContainer } from "../../shared/components/ToastContainer"
import { shouldRefreshCommandsAfterExecution } from "../../shared/hooks/commandExecution"
import { useCommandPaletteStateRedux } from "../../shared/hooks/useCommandPaletteStateRedux"
import { useGetCommands } from "../../shared/hooks/useGetCommands"
import { useGlobalKeybindings } from "../../shared/hooks/useGlobalKeybindings"
import { useOpenPaletteAtCommand } from "../../shared/hooks/useOpenPaletteAtCommand"
import { useSendMessage } from "../../shared/hooks/useSendMessage"
import { useAppDispatch } from "../../shared/store/hooks"
import { resetNavigation } from "../../shared/store/slices/navigation.slice"
import {
  loadPermissions,
  loadSettings,
} from "../../shared/store/slices/settings.slice"
import { subscribeSiteSdkCommandsChanged } from "../siteSdkBridge"

// Store is provided by ContentCommandPaletteWithState at the root

interface ContentCommandPaletteProps {
  onClose?: () => void
}

export const ContentCommandPalette: React.FC<ContentCommandPaletteProps> = ({
  onClose,
}) => {
  const { data, fetchCommands } = useGetCommands()
  const { isOpen, showUI, hideUI } = useCommandPaletteStateRedux()
  const sendMessage = useSendMessage()
  const dispatch = useAppDispatch()
  const openPaletteAtCommand = useOpenPaletteAtCommand({
    fetchCommands,
    showPalette: showUI,
  })

  // Site SDK registrations can add keybindings without a settings write, so
  // the keybinding hook needs this signal to keep its local snapshot fresh.
  const subscribeToRefreshSignals = useCallback(
    (refresh: () => void) => subscribeSiteSdkCommandsChanged(refresh),
    [],
  )

  // Enable global keybindings for content script
  useGlobalKeybindings({
    onOpenPaletteAtCommand: openPaletteAtCommand,
    subscribeToRefreshSignals,
  })

  // Load permissions, settings and fetch commands on initial render
  useEffect(() => {
    dispatch(loadPermissions())
    dispatch(loadSettings())
    fetchCommands()
  }, [])

  // When the palette closes, reset navigation to the root page so reopening
  // starts at home rather than on a deep child page, and refetch commands.
  useEffect(() => {
    if (!isOpen) {
      dispatch(resetNavigation())
      fetchCommands()
    }
  }, [isOpen, fetchCommands, dispatch])

  useEffect(() => {
    return subscribeSiteSdkCommandsChanged(() => {
      fetchCommands()
    })
  }, [fetchCommands])

  // Execute command via background script (with parentNames support)
  const executeCommand = useCallback(
    async (
      id: string,
      formValues: Record<string, string | string[]>,
      navigateBack: boolean = true,
      parentNames?: string[],
      executionScope?: CommandExecutionScope,
    ) => {
      try {
        const response = await sendMessage({
          type: "execute-command",
          id,
          formValues,
          parentNames,
          executionScope,
        })

        if (response.success) {
          if (shouldRefreshCommandsAfterExecution(navigateBack)) {
            await fetchCommands()
          }

          if (navigateBack) {
            hideUI() // Close palette in content script mode
            onClose?.() // Call additional close handler if provided
          }
        }

        // TODO: Handle errors
      } catch (error) {
        console.error(
          "[ContentCommandPalette] Error sending execute message:",
          error,
        )
      }
    },
    [fetchCommands, hideUI, onClose, sendMessage],
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
      {/* Always mounted so screenshot capture works after the palette hides. */}
      <CopyToClipboardListener />
      <NewTabListener />
      <ScrollListener />
      <ScreenshotListener />
      <ToastContainer />
    </>
  )
}
