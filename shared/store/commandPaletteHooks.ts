import { useDispatch, useSelector, useStore } from "react-redux"
import type {
  CommandPaletteDispatch,
  CommandPaletteRootState,
  CommandPaletteStore,
} from "./commandPaletteStore"

export const useCommandPaletteDispatch =
  useDispatch.withTypes<CommandPaletteDispatch>()
export const useCommandPaletteSelector =
  useSelector.withTypes<CommandPaletteRootState>()
export const useCommandPaletteStore = useStore.withTypes<CommandPaletteStore>()
