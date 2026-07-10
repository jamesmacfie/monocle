// Architecture: options-page Redux state for the background-owned command
// settings catalog. Typed message thunks load catalog rows and persist
// visibility, URL-rule, and keybinding edits; updatingIds tracks concurrent
// row mutations without moving storage ownership into the UI. See
// docs/settings-page.md.
import { createSlice } from "@reduxjs/toolkit"
import type {
  CommandUrlRulesSetting,
  SettingsCatalogCommand,
  SettingsCatalogResponse,
  UpdateCommandKeybindingsConflict,
  UpdateCommandKeybindingsResponse,
} from "../../../shared/types"
import { createMessageThunk } from "../messageThunk"
import { toggleId } from "../updatingIds"

type SettingsCatalogState = {
  commands: SettingsCatalogCommand[]
  loading: boolean
  error: string | null
  updatingIds: string[]
}

const initialState: SettingsCatalogState = {
  commands: [],
  loading: false,
  error: null,
  updatingIds: [],
}

export const loadSettingsCatalog = createMessageThunk<
  SettingsCatalogResponse,
  void,
  SettingsCatalogResponse
>(
  "settingsCatalog/load",
  () => ({ type: "monocle-settings-catalog-get" }),
  (response) => response,
  "Failed to load settings catalog",
)

export const setCatalogCommandHidden = createMessageThunk<
  { commandId: string; hidden: boolean },
  { commandId: string; hidden: boolean },
  { success: true }
>(
  "settingsCatalog/setHidden",
  ({ commandId, hidden }) => ({
    type: "monocle-command-setting-update",
    id: commandId,
    setting: "hidden",
    value: hidden,
  }),
  (_response, arg) => arg,
  "Failed to update command",
)

export const setCatalogCommandFavorite = createMessageThunk<
  { commandId: string; favorite: boolean },
  { commandId: string; favorite: boolean },
  { success: true }
>(
  "settingsCatalog/setFavorite",
  ({ commandId, favorite }) => ({
    type: "monocle-command-favorite-set",
    id: commandId,
    favorite,
  }),
  (_response, arg) => arg,
  "Failed to update favorite",
)

export const setCatalogCommandKeybinding = createMessageThunk<
  { commandId: string; keybinding?: string },
  { commandId: string; keybinding?: string | null },
  { success: true }
>(
  "settingsCatalog/setKeybinding",
  ({ commandId, keybinding }) => ({
    type: "monocle-command-setting-update",
    id: commandId,
    setting: "keybinding",
    value: keybinding ?? null,
  }),
  (_response, { commandId, keybinding }) => ({
    commandId,
    keybinding: keybinding || undefined,
  }),
  "Failed to update keybinding",
)

export const setCatalogCommandKeybindings = createMessageThunk<
  {
    updates: Array<{ commandId: string; keybinding?: string }>
    conflicts: UpdateCommandKeybindingsConflict[]
  },
  { updates: Array<{ commandId: string; keybinding?: string | null }> },
  UpdateCommandKeybindingsResponse
>(
  "settingsCatalog/setKeybindings",
  ({ updates }) => ({
    type: "monocle-command-keybindings-update",
    updates,
  }),
  (response, { updates }) => {
    const conflicts = response.conflicts ?? []
    const conflictedIds = new Set(
      conflicts.map((conflict) => conflict.commandId),
    )
    return {
      updates: updates
        .filter((update) => !conflictedIds.has(update.commandId))
        .map((update) => ({
          commandId: update.commandId,
          keybinding: update.keybinding || undefined,
        })),
      conflicts,
    }
  },
  "Failed to update keybindings",
)

export const setCatalogCommandUrlRules = createMessageThunk<
  { commandId: string; urlRules: CommandUrlRulesSetting },
  { commandId: string; urlRules: CommandUrlRulesSetting },
  { success: true }
>(
  "settingsCatalog/setUrlRules",
  ({ commandId, urlRules }) => ({
    type: "monocle-command-setting-update",
    id: commandId,
    setting: "urlRules",
    value: urlRules,
  }),
  (_response, arg) => arg,
  "Failed to update URL rules",
)

const updateCommand = (
  state: SettingsCatalogState,
  commandId: string,
  update: (command: SettingsCatalogCommand) => void,
) => {
  const command = state.commands.find((item) => item.id === commandId)
  if (command) {
    update(command)
  }
}

export const settingsCatalogSlice = createSlice({
  name: "settingsCatalog",
  initialState,
  reducers: {
    clearSettingsCatalogError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSettingsCatalog.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(loadSettingsCatalog.fulfilled, (state, action) => {
        state.loading = false
        state.error = null
        state.commands = action.payload.commands
      })
      .addCase(loadSettingsCatalog.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload ?? "Failed to load settings catalog"
      })
      .addCase(setCatalogCommandHidden.pending, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.commandId,
          true,
        )
      })
      .addCase(setCatalogCommandHidden.fulfilled, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.payload.commandId,
          false,
        )
        updateCommand(state, action.payload.commandId, (command) => {
          command.settings.hidden = action.payload.hidden || undefined
        })
      })
      .addCase(setCatalogCommandHidden.rejected, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.commandId,
          false,
        )
        state.error = action.payload ?? "Failed to update command"
      })
      .addCase(setCatalogCommandFavorite.pending, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.commandId,
          true,
        )
      })
      .addCase(setCatalogCommandFavorite.fulfilled, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.payload.commandId,
          false,
        )
        updateCommand(state, action.payload.commandId, (command) => {
          command.isFavorite = action.payload.favorite
        })
      })
      .addCase(setCatalogCommandFavorite.rejected, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.commandId,
          false,
        )
        state.error = action.payload ?? "Failed to update favorite"
      })
      .addCase(setCatalogCommandKeybinding.pending, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.commandId,
          true,
        )
      })
      .addCase(setCatalogCommandKeybinding.fulfilled, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.payload.commandId,
          false,
        )
        updateCommand(state, action.payload.commandId, (command) => {
          command.settings.keybinding = action.payload.keybinding
          command.effectiveKeybinding =
            action.payload.keybinding || command.defaultKeybinding
        })
      })
      .addCase(setCatalogCommandKeybinding.rejected, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.commandId,
          false,
        )
        state.error = action.payload ?? "Failed to update keybinding"
      })
      .addCase(setCatalogCommandKeybindings.pending, (state, action) => {
        for (const update of action.meta.arg.updates) {
          state.updatingIds = toggleId(
            state.updatingIds,
            update.commandId,
            true,
          )
        }
      })
      .addCase(setCatalogCommandKeybindings.fulfilled, (state, action) => {
        // Conflicted updates are absent from the payload but were still marked
        // as updating by the pending case — clear the flag for the whole batch.
        for (const update of action.meta.arg.updates) {
          state.updatingIds = toggleId(
            state.updatingIds,
            update.commandId,
            false,
          )
        }
        for (const update of action.payload.updates) {
          updateCommand(state, update.commandId, (command) => {
            command.settings.keybinding = update.keybinding
            command.effectiveKeybinding =
              update.keybinding || command.defaultKeybinding
          })
        }
      })
      .addCase(setCatalogCommandKeybindings.rejected, (state, action) => {
        for (const update of action.meta.arg.updates) {
          state.updatingIds = toggleId(
            state.updatingIds,
            update.commandId,
            false,
          )
        }
        state.error = action.payload ?? "Failed to update keybindings"
      })
      .addCase(setCatalogCommandUrlRules.pending, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.commandId,
          true,
        )
      })
      .addCase(setCatalogCommandUrlRules.fulfilled, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.payload.commandId,
          false,
        )
        updateCommand(state, action.payload.commandId, (command) => {
          command.settings.urlRules = {
            ...command.settings.urlRules,
            ...action.payload.urlRules,
          }
          command.capabilities.hasUrlRules =
            Boolean(command.settings.urlRules.allowUrls?.length) ||
            Boolean(command.settings.urlRules.denyUrls?.length)
        })
      })
      .addCase(setCatalogCommandUrlRules.rejected, (state, action) => {
        state.updatingIds = toggleId(
          state.updatingIds,
          action.meta.arg.commandId,
          false,
        )
        state.error = action.payload ?? "Failed to update URL rules"
      })
  },
})

export const { clearSettingsCatalogError } = settingsCatalogSlice.actions

export const selectSettingsCatalogCommands = (state: {
  settingsCatalog: SettingsCatalogState
}) => state.settingsCatalog.commands

export const selectSettingsCatalogLoading = (state: {
  settingsCatalog: SettingsCatalogState
}) => state.settingsCatalog.loading

export const selectSettingsCatalogError = (state: {
  settingsCatalog: SettingsCatalogState
}) => state.settingsCatalog.error

export const selectSettingsCatalogUpdatingIds = (state: {
  settingsCatalog: SettingsCatalogState
}) => state.settingsCatalog.updatingIds

export default settingsCatalogSlice.reducer
