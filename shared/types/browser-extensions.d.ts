import type { Browser, WxtBrowser } from "wxt/browser"

declare global {
  const chrome: WxtBrowser
  const browser: WxtBrowser & {
    tabs: WxtBrowser["tabs"] & {
      toggleReaderMode?: (tabId: number) => Promise<void>
      saveAsPDF?: (options: any) => Promise<void>
    }
    contextualIdentities?: {
      query: (queryInfo: any) => Promise<any[]>
    }
  }

  namespace chrome {
    namespace browsingData {
      type DataTypeSet = Browser.browsingData.DataTypeSet
      type RemovalOptions = Browser.browsingData.RemovalOptions
    }

    namespace history {
      type HistoryItem = Browser.history.HistoryItem
      type HistoryQuery = Browser.history.HistoryQuery
    }

    namespace runtime {
      type ManifestPermissions = Browser.runtime.ManifestPermissions
      type MessageSender = Browser.runtime.MessageSender
    }

    namespace sessions {
      type Session = Browser.sessions.Session
    }
  }

  namespace browser {
    namespace runtime {
      type MessageSender = Browser.runtime.MessageSender
    }
  }

  interface ImportMetaEnv {
    readonly WXT_UNSPLASH_ACCESS_KEY?: string
    readonly EXTENSION_PUBLIC_UNSPLASH_ACCESS_KEY?: string
  }
}
