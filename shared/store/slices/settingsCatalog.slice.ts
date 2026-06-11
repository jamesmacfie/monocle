import { createAsyncThunk, createSlice } from "@reduxjs/toolkit"
import type {
  CommandUrlRulesSetting,
  SettingsCatalogCommand,
  SettingsCatalogResponse,
} from "../../../shared/types"

type CatalogThunkApi = {
  sendMessage: (message: unknown) => Promise<unknown>
}

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

const getSendMessage = (extra: unknown) =>
  (extra as CatalogThunkApi).sendMessage

export const loadSettingsCatalog = createAsyncThunk<
  SettingsCatalogResponse,
  void,
  { extra: CatalogThunkApi; rejectValue: string }
>("settingsCatalog/load", async (_, { extra, rejectWithValue }) => {
  try {
    const response = (await getSendMessage(extra)({
      type: "get-settings-catalog",
    })) as SettingsCatalogResponse | { error?: string }

    if ("error" in response && response.error) {
      return rejectWithValue(response.error)
    }

    return response as SettingsCatalogResponse
  } catch (error) {
    return rejectWithValue(
      error instanceof Error
        ? error.message
        : "Failed to load settings catalog",
    )
  }
})

export const setCatalogCommandHidden = createAsyncThunk<
  { commandId: string; hidden: boolean },
  { commandId: string; hidden: boolean },
  { extra: CatalogThunkApi; rejectValue: string }
>(
  "settingsCatalog/setHidden",
  async ({ commandId, hidden }, { extra, rejectWithValue }) => {
    try {
      const response = (await getSendMessage(extra)({
        type: "update-command-setting",
        commandId,
        setting: "hidden",
        value: hidden,
      })) as { error?: string }

      if (response?.error) {
        return rejectWithValue(response.error)
      }

      return { commandId, hidden }
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update command",
      )
    }
  },
)

export const setCatalogCommandFavorite = createAsyncThunk<
  { commandId: string; favorite: boolean },
  { commandId: string; favorite: boolean },
  { extra: CatalogThunkApi; rejectValue: string }
>(
  "settingsCatalog/setFavorite",
  async ({ commandId, favorite }, { extra, rejectWithValue }) => {
    try {
      const response = (await getSendMessage(extra)({
        type: "set-command-favorite",
        commandId,
        favorite,
      })) as { error?: string }

      if (response?.error) {
        return rejectWithValue(response.error)
      }

      return { commandId, favorite }
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update favorite",
      )
    }
  },
)

export const setCatalogCommandKeybinding = createAsyncThunk<
  { commandId: string; keybinding?: string },
  { commandId: string; keybinding?: string | null },
  { extra: CatalogThunkApi; rejectValue: string }
>(
  "settingsCatalog/setKeybinding",
  async ({ commandId, keybinding }, { extra, rejectWithValue }) => {
    try {
      const response = (await getSendMessage(extra)({
        type: "update-command-setting",
        commandId,
        setting: "keybinding",
        value: keybinding ?? null,
      })) as { error?: string }

      if (response?.error) {
        return rejectWithValue(response.error)
      }

      return { commandId, keybinding: keybinding || undefined }
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update keybinding",
      )
    }
  },
)

export const setCatalogCommandKeybindings = createAsyncThunk<
  { updates: Array<{ commandId: string; keybinding?: string }> },
  { updates: Array<{ commandId: string; keybinding?: string | null }> },
  { extra: CatalogThunkApi; rejectValue: string }
>(
  "settingsCatalog/setKeybindings",
  async ({ updates }, { extra, rejectWithValue }) => {
    try {
      const response = (await getSendMessage(extra)({
        type: "update-command-keybindings",
        updates,
      })) as { error?: string }

      if (response?.error) {
        return rejectWithValue(response.error)
      }

      return {
        updates: updates.map((update) => ({
          commandId: update.commandId,
          keybinding: update.keybinding || undefined,
        })),
      }
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update keybindings",
      )
    }
  },
)

export const setCatalogCommandUrlRules = createAsyncThunk<
  { commandId: string; urlRules: CommandUrlRulesSetting },
  { commandId: string; urlRules: CommandUrlRulesSetting },
  { extra: CatalogThunkApi; rejectValue: string }
>(
  "settingsCatalog/setUrlRules",
  async ({ commandId, urlRules }, { extra, rejectWithValue }) => {
    try {
      const response = (await getSendMessage(extra)({
        type: "update-command-setting",
        commandId,
        setting: "urlRules",
        value: urlRules,
      })) as { error?: string }

      if (response?.error) {
        return rejectWithValue(response.error)
      }

      return { commandId, urlRules }
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to update URL rules",
      )
    }
  },
)

const setUpdating = (
  state: SettingsCatalogState,
  commandId: string,
  isUpdating: boolean,
) => {
  if (isUpdating) {
    if (!state.updatingIds.includes(commandId)) {
      state.updatingIds.push(commandId)
    }
    return
  }

  state.updatingIds = state.updatingIds.filter((id) => id !== commandId)
}

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
        setUpdating(state, action.meta.arg.commandId, true)
      })
      .addCase(setCatalogCommandHidden.fulfilled, (state, action) => {
        setUpdating(state, action.payload.commandId, false)
        updateCommand(state, action.payload.commandId, (command) => {
          command.settings.hidden = action.payload.hidden || undefined
        })
      })
      .addCase(setCatalogCommandHidden.rejected, (state, action) => {
        setUpdating(state, action.meta.arg.commandId, false)
        state.error = action.payload ?? "Failed to update command"
      })
      .addCase(setCatalogCommandFavorite.pending, (state, action) => {
        setUpdating(state, action.meta.arg.commandId, true)
      })
      .addCase(setCatalogCommandFavorite.fulfilled, (state, action) => {
        setUpdating(state, action.payload.commandId, false)
        updateCommand(state, action.payload.commandId, (command) => {
          command.isFavorite = action.payload.favorite
        })
      })
      .addCase(setCatalogCommandFavorite.rejected, (state, action) => {
        setUpdating(state, action.meta.arg.commandId, false)
        state.error = action.payload ?? "Failed to update favorite"
      })
      .addCase(setCatalogCommandKeybinding.pending, (state, action) => {
        setUpdating(state, action.meta.arg.commandId, true)
      })
      .addCase(setCatalogCommandKeybinding.fulfilled, (state, action) => {
        setUpdating(state, action.payload.commandId, false)
        updateCommand(state, action.payload.commandId, (command) => {
          command.settings.keybinding = action.payload.keybinding
          command.effectiveKeybinding =
            action.payload.keybinding || command.defaultKeybinding
        })
      })
      .addCase(setCatalogCommandKeybinding.rejected, (state, action) => {
        setUpdating(state, action.meta.arg.commandId, false)
        state.error = action.payload ?? "Failed to update keybinding"
      })
      .addCase(setCatalogCommandKeybindings.pending, (state, action) => {
        for (const update of action.meta.arg.updates) {
          setUpdating(state, update.commandId, true)
        }
      })
      .addCase(setCatalogCommandKeybindings.fulfilled, (state, action) => {
        for (const update of action.payload.updates) {
          setUpdating(state, update.commandId, false)
          updateCommand(state, update.commandId, (command) => {
            command.settings.keybinding = update.keybinding
            command.effectiveKeybinding =
              update.keybinding || command.defaultKeybinding
          })
        }
      })
      .addCase(setCatalogCommandKeybindings.rejected, (state, action) => {
        for (const update of action.meta.arg.updates) {
          setUpdating(state, update.commandId, false)
        }
        state.error = action.payload ?? "Failed to update keybindings"
      })
      .addCase(setCatalogCommandUrlRules.pending, (state, action) => {
        setUpdating(state, action.meta.arg.commandId, true)
      })
      .addCase(setCatalogCommandUrlRules.fulfilled, (state, action) => {
        setUpdating(state, action.payload.commandId, false)
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
        setUpdating(state, action.meta.arg.commandId, false)
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
