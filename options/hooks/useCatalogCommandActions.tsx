import { useState } from "react"
import { useAppDispatch } from "../../shared/store/hooks"
import {
  setCatalogCommandKeybinding,
  setCatalogCommandUrlRules,
} from "../../shared/store/slices/settingsCatalog.slice"
import type {
  CommandUrlRulesSetting,
  SettingsCatalogCommand,
} from "../../shared/types"
import { KeybindingDialog } from "../components/KeybindingDialog"
import { UrlRulesDialog } from "../components/UrlRulesDialog"

export function useCatalogCommandActions() {
  const dispatch = useAppDispatch()
  const [keybindingCommand, setKeybindingCommand] =
    useState<SettingsCatalogCommand | null>(null)
  const [urlRulesCommand, setUrlRulesCommand] =
    useState<SettingsCatalogCommand | null>(null)

  const saveUrlRules = (
    command: SettingsCatalogCommand,
    urlRules: CommandUrlRulesSetting,
  ) => {
    void dispatch(
      setCatalogCommandUrlRules({
        commandId: command.id,
        urlRules,
      }),
    )
  }

  const dialogs = (
    <>
      <KeybindingDialog
        command={keybindingCommand}
        open={Boolean(keybindingCommand)}
        onOpenChange={(open) => {
          if (!open) {
            setKeybindingCommand(null)
          }
        }}
        onSave={(keybinding) => {
          if (!keybindingCommand) {
            return
          }

          void dispatch(
            setCatalogCommandKeybinding({
              commandId: keybindingCommand.id,
              keybinding,
            }),
          )
        }}
        onReset={() => {
          if (!keybindingCommand) {
            return
          }

          void dispatch(
            setCatalogCommandKeybinding({
              commandId: keybindingCommand.id,
              keybinding: null,
            }),
          )
          setKeybindingCommand(null)
        }}
      />

      <UrlRulesDialog
        command={urlRulesCommand}
        open={Boolean(urlRulesCommand)}
        onOpenChange={(open) => {
          if (!open) {
            setUrlRulesCommand(null)
          }
        }}
        onSave={(urlRules) => {
          if (urlRulesCommand) {
            saveUrlRules(urlRulesCommand, urlRules)
          }
        }}
      />
    </>
  )

  return {
    dialogs,
    editKeybinding: setKeybindingCommand,
    editUrlRules: setUrlRulesCommand,
  }
}
