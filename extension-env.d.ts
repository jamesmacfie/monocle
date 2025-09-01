// Required Extension.js types for TypeScript projects.
// This file is auto-generated and should not be excluded.
// If you need additional types, consider creating a new *.d.ts file and
// referencing it in the "include" array of your tsconfig.json file.
// See https://www.typescriptlang.org/tsconfig#include for more information.
/// <reference types="extension/types" />

// Polyfill types for browser.* APIs
/// <reference types="extension/types/polyfill" />

// Browser extension API globals
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
