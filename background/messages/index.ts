import { match } from "ts-pattern"
import type { Message } from "../../types/"
import { checkKeybindingConflict } from "./checkKeybindingConflict"
import { executeCommand } from "./executeCommand"
import { executeKeybinding } from "./executeKeybinding"
import { getChildrenCommands } from "./getChildrenCommands"
import { getCommands } from "./getCommands"
import { getPermissions } from "./getPermissions"
import { getUnsplashBackground } from "./getUnsplashBackground"
import { requestPermission } from "./requestPermission"
import { requestToast } from "./requestToast"
import { showToast } from "./showToast"
import { updateCommandSetting } from "./updateCommandSetting"

export const handleMessage = async (message: Message, _sender?: any) => {
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
    .with({ type: "request-toast" }, async (msg) => {
      return await requestToast(msg)
    })
    .with({ type: "update-command-setting" }, async (msg) => {
      return await updateCommandSetting(msg)
    })
    .with({ type: "check-keybinding-conflict" }, async (msg) => {
      return await checkKeybindingConflict(msg)
    })
    .with({ type: "get-unsplash-background" }, async (msg) => {
      return await getUnsplashBackground(msg)
    })
    .with({ type: "get-permissions" }, async (msg) => {
      return await getPermissions(msg)
    })
    .with({ type: "request-permission" }, async (msg) => {
      return await requestPermission(msg)
    })
    .otherwise(() => {
      throw new Error(`Unknown message type: ${(message as any).type}`)
    })
}
