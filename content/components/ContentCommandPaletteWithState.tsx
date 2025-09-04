import * as React from "react"
import { Provider } from "react-redux"
import { createCommandPaletteStore } from "../../shared/store/commandPaletteStore"
import { ContentCommandPalette } from "./ContentCommandPalette"

interface ContentCommandPaletteWithStateProps {
  onClose?: () => void
}

export const ContentCommandPaletteWithState: React.FC<
  ContentCommandPaletteWithStateProps
> = ({ onClose }) => {
  // Create the command palette state store - should be false for content script (overlay mode)
  const store = React.useMemo(() => createCommandPaletteStore(false), [])

  return (
    <Provider store={store}>
      <ContentCommandPalette onClose={onClose} />
    </Provider>
  )
}
