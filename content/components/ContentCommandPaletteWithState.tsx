import * as React from "react"
import { Provider } from "react-redux"
import { createAppStore } from "../../shared/store"
import { createPaletteSendMessage } from "../../shared/store/sendMessage"
import { ContentCommandPalette } from "./ContentCommandPalette"

interface ContentCommandPaletteWithStateProps {
  onClose?: () => void
}

export const ContentCommandPaletteWithState: React.FC<
  ContentCommandPaletteWithStateProps
> = ({ onClose }) => {
  // Create a single app store for content overlay with messaging available to thunks
  const sendMessage = React.useMemo(() => createPaletteSendMessage(), [])

  const store = React.useMemo(() => createAppStore(sendMessage), [sendMessage])

  return (
    <Provider store={store}>
      <ContentCommandPalette onClose={onClose} />
    </Provider>
  )
}
