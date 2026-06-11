import { useCallback } from "react"
import { useAppDispatch } from "../store/hooks"
import {
  navigateToCommand,
  type Page,
  resetNavigation,
  setInitialCommands,
} from "../store/slices/navigation.slice"
import type { CommandData } from "../types"

type OpenPaletteAtCommandOptions = {
  fetchCommands: () => Promise<CommandData>
  showPalette?: () => void
}

export function useOpenPaletteAtCommand({
  fetchCommands,
  showPalette,
}: OpenPaletteAtCommandOptions) {
  const dispatch = useAppDispatch()

  return useCallback(
    async (commandId: string) => {
      showPalette?.()

      const rootCommands = await fetchCommands()
      const rootPage: Page = {
        id: "root",
        commands: rootCommands,
        searchValue: "",
        parentPath: [],
        formValues: {},
        dynamicChildren: false,
      }

      dispatch(setInitialCommands(rootCommands))
      dispatch(resetNavigation())

      try {
        await dispatch(
          navigateToCommand({
            id: commandId,
            currentPage: rootPage,
          }),
        ).unwrap()
      } catch (error) {
        console.error(
          `[useOpenPaletteAtCommand] Failed to open command ${commandId}:`,
          error,
        )
      }
    },
    [dispatch, fetchCommands, showPalette],
  )
}
