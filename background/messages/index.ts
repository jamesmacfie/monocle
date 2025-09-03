import { match } from "ts-pattern"
import type { Message } from "../../types/"
import { executeCommand } from "./executeCommand"
import { executeKeybinding } from "./executeKeybinding"
import { getChildrenCommands } from "./getChildrenCommands"
import { getCommands } from "./getCommands"
import { showToast } from "./showToast"

export const handleMessage = async (message: Message) => {
  console.debug("[HandleMessage] Received message:", message.type, message)

  return await match(message)
    .with({ type: "get-commands" }, async (msg) => {
      return await getCommands(msg)
    })
    .with({ type: "get-children-commands" }, async (msg) => {
      return await getChildrenCommands(msg)
    })
    .with({ type: "execute-command" }, async (msg) => {
      return await executeCommand(msg)
    })
    .with({ type: "execute-keybinding" }, async (msg) => {
      return await executeKeybinding(msg)
    })
    .with({ type: "show-toast" }, async (msg) => {
      return await showToast(msg)
    })
    .otherwise(() => {
      throw new Error(`Unknown message type: ${(message as any).type}`)
    })
}
