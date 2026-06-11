import { describe, expect, it } from "vitest"
import type { SettingsCatalogCommand } from "../../shared/types"
import {
  getTemplatePreviewRows,
  getTemplateSaveOperations,
} from "./keybindingTemplates"

const command = (
  id: string,
  overrides: Partial<SettingsCatalogCommand> = {},
): SettingsCatalogCommand => ({
  id,
  type: "action",
  name: id,
  categoryId: "browser",
  categoryLabel: "Browser",
  parentPath: [],
  parentNames: [],
  settings: {},
  isFavorite: false,
  usage: {
    totalUsage: 0,
    lastUsed: 0,
    emaScore: 0,
  },
  capabilities: {
    configurable: true,
    canHide: true,
    canFavorite: true,
    canSetKeybinding: true,
    canEditUrlRules: true,
    hasUrlRules: false,
  },
  ...overrides,
})

describe("keybinding templates", () => {
  it("does not expose clipboard-read commands that are not implemented", () => {
    const commands = [command("copy-current-url")]

    const previewCommandIds = getTemplatePreviewRows("vim", commands).map(
      (row) => row.commandId,
    )
    const operations = getTemplateSaveOperations({
      templateId: "vim",
      commands,
      overrideCustomKeybindings: true,
    })
    const operationCommandIds = operations.map(
      (operation) => operation.commandId,
    )

    expect(previewCommandIds).not.toContain("open-url-from-clipboard")
    expect(previewCommandIds).not.toContain("open-url-from-clipboard-new-tab")
    expect(operationCommandIds).not.toContain("open-url-from-clipboard")
    expect(operationCommandIds).not.toContain("open-url-from-clipboard-new-tab")
  })

  it("preserves custom keybindings unless override is checked", () => {
    const commands = [
      command("copy-current-url", {
        settings: { keybinding: "c" },
        effectiveKeybinding: "c",
      }),
      command("reload-current-tab", {
        defaultKeybinding: "<cmd-r>",
        effectiveKeybinding: "<cmd-r>",
      }),
    ]

    const preserved = getTemplateSaveOperations({
      templateId: "vim",
      commands,
      overrideCustomKeybindings: false,
    })
    const overridden = getTemplateSaveOperations({
      templateId: "vim",
      commands,
      overrideCustomKeybindings: true,
    })

    expect(preserved).toEqual([
      {
        commandId: "reload-current-tab",
        keybinding: "r",
      },
    ])
    expect(overridden).toContainEqual({
      commandId: "copy-current-url",
      keybinding: "y, y",
    })
  })

  it("clears custom keybindings for the Default template only with override", () => {
    const commands = [
      command("reload-current-tab", {
        defaultKeybinding: "<cmd-r>",
        effectiveKeybinding: "r",
        settings: { keybinding: "r" },
      }),
      command("open-new-tab", {
        defaultKeybinding: "<cmd-t>",
        effectiveKeybinding: "<cmd-t>",
      }),
    ]

    expect(
      getTemplateSaveOperations({
        templateId: "default",
        commands,
        overrideCustomKeybindings: false,
      }),
    ).toEqual([])
    expect(
      getTemplateSaveOperations({
        templateId: "default",
        commands,
        overrideCustomKeybindings: true,
      }),
    ).toEqual([
      {
        commandId: "reload-current-tab",
        keybinding: null,
      },
    ])
  })
})
