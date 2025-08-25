// Main command palette component
export { CommandPalette } from "./CommandPalette";

// Sub-components
export { CommandHeader } from "./CommandHeader";
export { CommandList } from "./CommandList";
export { CommandItem } from "./CommandItem";
export { CommandFooter } from "./CommandFooter";
export { CommandActions } from "./CommandActions";
export { CommandName, getDisplayName } from "./CommandName";

// Re-export shared types for convenience
export type {
  Page,
  UI,
  CommandData,
  CommandItemProps,
  CommandListProps,
  CommandHeaderProps,
  CommandFooterProps,
  CommandActionsProps,
} from "../../types/command"; 