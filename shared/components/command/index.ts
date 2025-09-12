// Main command palette component

// Re-export shared types for convenience
export type {
  CommandActionsProps,
  CommandData,
  CommandFooterProps,
  CommandHeaderProps,
  CommandItemProps,
  CommandListProps,
  Page,
} from "../../types/command"
export { CommandActions } from "./CommandActions"
export { CommandActionsList } from "./CommandActionsList"
export { CommandFooter } from "./CommandFooter"
// Sub-components
export { CommandHeader } from "./CommandHeader"
export { CommandItem } from "./CommandItem"
export { CommandList } from "./CommandList"
export { CommandName, getDisplayName } from "./CommandName"
export { CommandPalette } from "./CommandPalette"
export { PermissionActions } from "./PermissionActions"
