import { Command } from "cmdk"
import { useEffect, useRef } from "react"
import { useOnClickOutside } from "usehooks-ts"
import { usePermissionsGranted } from "../../hooks/usePermissionsGranted"
import type { CommandActionsProps } from "../../types/command"
import { CommandActionsList } from "./CommandActionsList"
import { PermissionActions } from "./PermissionActions"

export function CommandActions({
  open,
  selectedValue,
  inputRef,
  suggestion,
  onActionSelect,
  onClose,
  onRefresh,
}: CommandActionsProps) {
  const actionInputRef = useRef<HTMLInputElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  const commandPermissions = suggestion.permissions || []
  const actions = suggestion.actions || []

  const { isGrantedAllPermissions, missingPermissions } =
    usePermissionsGranted(commandPermissions)

  // Clear all confirmation states when the menu closes
  useEffect(() => {
    if (!open) {
      // When menu closes, all ActionItems will unmount and their state will be cleared naturally
      // This ensures consistent state reset behavior
    }
  }, [open])

  useOnClickOutside(overlayRef, (_event) => {
    onClose?.()
  })

  useEffect(() => {
    if (open && actionInputRef.current) {
      setTimeout(() => {
        actionInputRef.current?.focus()
      }, 50)
    }
  }, [open])

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        setTimeout(() => {
          inputRef?.current?.focus()
        }, 50)
      }
    }

    if (open) {
      document.addEventListener("keydown", handleEscape)
    }

    return () => {
      document.removeEventListener("keydown", handleEscape)
    }
  }, [open, onClose, inputRef])

  const handleActionSelect = (actionId: string) => {
    if (onActionSelect) {
      onActionSelect(actionId)
    }
    onClose()
    setTimeout(() => {
      inputRef?.current?.focus()
    }, 50)
  }

  if (!selectedValue || !actions.length || !open) {
    return null
  }

  return (
    <div
      ref={overlayRef}
      className="raycast-submenu-overlay"
      data-state={open ? "open" : "closed"}
    >
      <div className="raycast-submenu">
        <Command loop>
          <Command.List className="cmdk-subcommand-list">
            <Command.Group>
              {!isGrantedAllPermissions ? (
                <PermissionActions
                  missingPermissions={missingPermissions}
                  onRefresh={onRefresh}
                  onClose={onClose}
                />
              ) : (
                <CommandActionsList
                  actions={actions}
                  onActionSelect={handleActionSelect}
                  onRefresh={onRefresh}
                  onClose={onClose}
                  inputRef={inputRef}
                />
              )}
            </Command.Group>
          </Command.List>
          <Command.Input
            ref={actionInputRef}
            placeholder="Search for actions..."
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault()
                onClose()
                setTimeout(() => {
                  inputRef?.current?.focus()
                }, 50)
              }
            }}
          />
        </Command>
      </div>
    </div>
  )
}
