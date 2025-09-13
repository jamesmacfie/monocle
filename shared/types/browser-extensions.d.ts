// Browser extension API types for cross-browser compatibility
declare const chrome: any

// Browser API types for cross-compatibility
declare namespace browser {
  namespace runtime {
    type MessageSender = chrome.runtime.MessageSender
  }
}

// Extended browser API that includes Firefox-specific features
declare const browser: typeof chrome & {
  tabs: typeof chrome.tabs & {
    toggleReaderMode?: (tabId: number) => Promise<void>
    saveAsPDF?: (options: any) => Promise<void>
  }
  contextualIdentities?: {
    query: (queryInfo: any) => Promise<any[]>
  }
}
