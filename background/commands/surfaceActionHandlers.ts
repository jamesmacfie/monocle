// Architecture: background command layer. A small registry that lets a command
// receive `surface-action` callbacks for surfaces it owns (`command:<id>`),
// mirroring the per-feature `handleAction` path. A command that pushes an
// interactive surface (e.g. a `picker`) registers a handler keyed by its
// command id at module load; `background/messages/surfaceAction.ts` looks it up
// when an action arrives for a `command:` owner. Kept dependency-free so command
// modules and the message handler can both import it without a cycle.
// See docs/surfaces.md.
import type { PickedElement } from "../../shared/types"

export type CommandSurfaceActionContext = {
  selection?: PickedElement
  tab?: { id: number; url?: string }
}

export type CommandSurfaceActionHandler = (
  actionId: string,
  context: CommandSurfaceActionContext,
) => void | Promise<void>

const handlers = new Map<string, CommandSurfaceActionHandler>()

export const registerCommandSurfaceActionHandler = (
  commandId: string,
  handler: CommandSurfaceActionHandler,
): void => {
  handlers.set(commandId, handler)
}

export const getCommandSurfaceActionHandler = (
  commandId: string,
): CommandSurfaceActionHandler | undefined => handlers.get(commandId)
