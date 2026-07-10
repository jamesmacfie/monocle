import * as React from "react"

const { useEffect, useCallback } = React

import { CommandPalette } from "../../shared/components/Command/index"
import {
  type ExecuteCommandMessageWithoutContext,
  useExecuteCommand,
} from "../../shared/hooks/commandExecution"
import { useGetCommands } from "../../shared/hooks/useGetCommands"
import { useGlobalKeybindings } from "../../shared/hooks/useGlobalKeybindings"
import { useOpenPaletteAtCommand } from "../../shared/hooks/useOpenPaletteAtCommand"
import { useSendMessage } from "../../shared/hooks/useSendMessage"

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
  const openPaletteAtCommand = useOpenPaletteAtCommand({ fetchCommands })
  const sendCommandMessage = React.useCallback(
    (message: ExecuteCommandMessageWithoutContext) => {
      return sendMessage(message)
    },
    [sendMessage],
  )

  // Enable global keybindings
  useGlobalKeybindings({
    onOpenPaletteAtCommand: openPaletteAtCommand,
  })

  // Fetch commands on initial render
  useEffect(() => {
    fetchCommands()
  }, [])

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose()
    }
  }, [onClose])

  const executeCommand = useExecuteCommand({
    sendMessage: sendCommandMessage,
    refreshCommands: fetchCommands,
    onClose: handleClose,
    alwaysRefreshAfterSuccess: true,
    logPrefix: "NewTabCommandPalette",
  })

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
