import * as React from "react"
import { Provider } from "react-redux"
import { createAppStore } from "../../shared/store"
import { ContentCommandPalette } from "./ContentCommandPalette"

interface ContentCommandPaletteWithStateProps {
  onClose?: () => void
}

export const ContentCommandPaletteWithState: React.FC<
  ContentCommandPaletteWithStateProps
> = ({ onClose }) => {
  // Create a single app store for content overlay with messaging available to thunks
  const sendMessage = React.useMemo(() => {
    return (message: any) =>
      new Promise((resolve, reject) => {
        const context = {
          title: document.title,
          url: window.location.href,
          modifierKey: null,
        }
        const messageWithContext = { ...message, context }
        chrome.runtime.sendMessage(messageWithContext, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError)
          } else {
            resolve(response)
          }
        })
      })
  }, [])

  const store = React.useMemo(() => createAppStore(sendMessage), [sendMessage])

  return (
    <Provider store={store}>
      <ContentCommandPalette onClose={onClose} />
    </Provider>
  )
}
