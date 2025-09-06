You are tasked with maintaining the background commands. Here is some helpful info:

This guide explains how to create new commands for the Monocle browser extension. Commands are the core functionality that users can access through the command palette in both overlay mode (Cmd+K) and new tab mode.

## Command Architecture Overview

Commands in Monocle are TypeScript objects that extend `BaseCommand` and define how users interact with browser functionality. There are three main types:

- **RunCommand**: Immediate execution commands with a `run()` function
- **UICommand**: Commands requiring user input via forms before execution  
- **ParentCommand**: Commands that generate dynamic child commands

All commands work identically in both content script (overlay) and new tab deployment modes.

## BaseCommand Properties

Every command must have these core properties:

```typescript
interface BaseCommand {
  id: string                                    // Unique identifier (kebab-case)
  name: AsyncValue<string | string[]>           // Display name, can be async
  description?: AsyncValue<string>              // Optional description
  icon?: AsyncValue<CommandIcon>                // Icon configuration  
  color?: AsyncValue<ColorName | string>        // Theme color
  keywords?: AsyncValue<string[]>               // Search keywords
  keybinding?: string                          // Keyboard shortcut ("⌘ K", "⌃ d")
  supportedBrowsers?: Browser.Platform[]       // ["chrome", "firefox"]
  actions?: Command[]                          // Custom action menu items
  doNotAddToRecents?: boolean                  // Exclude from recent commands
}
```

### AsyncValue Pattern

Many properties support `AsyncValue<T>` which means they can be:
- **Static**: `name: "My Command"`
- **Async function**: `name: async (context) => \`Close "\${await getTabTitle()}"\``

This allows commands to be dynamic based on current browser state.

## RunCommand - Simple Execution

The most basic command type for immediate actions:

```typescript
interface RunCommand extends BaseCommand {
  run: (context?: Browser.Context, values?: Record<string, string>) => void | Promise<void>
  actionLabel?: AsyncValue<string>                           // Default action label
  modifierActionLabel?: { [key in ModifierKey]?: string }   // Modifier key labels
}
```

### Example: Simple Tab Command

```typescript
// background/commands/browser/closeCurrentTab.ts
import type { RunCommand } from "../../../types"
import { callBrowserAPI, getActiveTab, sendTabMessage } from "../../utils/browser"

export const closeCurrentTab: RunCommand = {
  id: "close-current-tab",
  name: "Close Current Tab",
  description: "Close the currently active tab",
  icon: { type: "lucide", name: "X" },
  color: "red",
  keywords: ["close", "tab", "shut"],
  keybinding: "⌘ w",
  
  // Modifier key behavior labels
  modifierActionLabel: {
    shift: "Close All Tabs",
    cmd: "Close Other Tabs"
  },
  
  run: async (context) => {
    try {
      const activeTab = await getActiveTab()
      
      if (context?.modifierKey === "shift") {
        // Close all tabs
        const tabs = await callBrowserAPI("tabs", "query", {})
        for (const tab of tabs) {
          await callBrowserAPI("tabs", "remove", tab.id)
        }
      } else if (context?.modifierKey === "cmd") {
        // Close other tabs
        const tabs = await callBrowserAPI("tabs", "query", {})
        for (const tab of tabs) {
          if (tab.id !== activeTab?.id) {
            await callBrowserAPI("tabs", "remove", tab.id)
          }
        }
      } else {
        // Close current tab
        if (activeTab) {
          await callBrowserAPI("tabs", "remove", activeTab.id)
        }
      }
      
      // Success feedback
      if (activeTab) {
        await sendTabMessage(activeTab.id, {
          type: "monocle-alert",
          level: "success", 
          message: "Tab closed successfully",
          icon: { type: "lucide", name: "CheckCircle" }
        })
      }
      
    } catch (error) {
      console.error("Failed to close tab:", error)
      
      const activeTab = await getActiveTab()
      if (activeTab) {
        await sendTabMessage(activeTab.id, {
          type: "monocle-alert",
          level: "error",
          message: "Failed to close tab",
          icon: { type: "lucide", name: "AlertTriangle" }
        })
      }
    }
  }
}
```

### RunCommand Key Points:
- **Immediate execution** when selected
- **Modifier key support** via `context?.modifierKey` 
- **Auto-generated actions**: Execute, modifier variants, toggle favorite
- **Cross-browser compatibility** using `callBrowserAPI`
- **User feedback** via alert system

## UICommand - Form Input Required

Commands that need user input before execution:

```typescript
interface UICommand extends BaseCommand {
  ui: CommandUI[]                              // Form field definitions
  run: (context?: Browser.Context, values?: Record<string, string>) => void | Promise<void>
  actionLabel?: AsyncValue<string>
  modifierActionLabel?: { [key in ModifierKey]?: string }
}

interface CommandUI {
  id: string                    // Field identifier
  type: "input" | "text"       // Input field or display text
  label?: string               // Field label  
  placeholder?: string         // Input placeholder
  defaultValue?: string        // Default field value
}
```

### Example: Search Command with Form

```typescript
// background/commands/tools/customSearch.ts  
import type { UICommand } from "../../../types"
import { callBrowserAPI, getActiveTab, sendTabMessage } from "../../utils/browser"

export const customSearch: UICommand = {
  id: "custom-search",
  name: "Custom Search",
  description: "Search any website with custom query",
  icon: { type: "lucide", name: "Search" },
  color: "blue",
  keywords: ["search", "query", "find"],
  
  // Form configuration
  ui: [
    {
      id: "query",
      type: "input",
      label: "Search Query",
      placeholder: "Enter your search terms...",
      defaultValue: ""
    },
    {
      id: "website", 
      type: "input",
      label: "Website",
      placeholder: "e.g., stackoverflow.com",
      defaultValue: "google.com"
    }
  ],
  
  // Modifier behaviors  
  modifierActionLabel: {
    cmd: "Search in New Window",
    shift: "Search in Private Window"
  },
  
  run: async (context, values) => {
    const query = values?.query || ""
    const website = values?.website || "google.com"
    
    // Build search URL
    let searchUrl = ""
    if (website.includes("google")) {
      searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`
    } else {
      searchUrl = `https://${website}/search?q=${encodeURIComponent(query)}`
    }
    
    try {
      // Handle modifier key behaviors
      if (context?.modifierKey === "cmd") {
        // New window logic would go here
        await callBrowserAPI("windows", "create", { url: searchUrl })
      } else {
        // Regular new tab
        await callBrowserAPI("tabs", "create", { url: searchUrl })
      }
      
      // Success feedback
      const activeTab = await getActiveTab()
      if (activeTab) {
        await sendTabMessage(activeTab.id, {
          type: "monocle-alert",
          level: "success",
          message: `Searching for "${query}" on ${website}`,
          icon: { type: "lucide", name: "ExternalLink" }
        })
      }
      
    } catch (error) {
      console.error("Search failed:", error)
      
      const activeTab = await getActiveTab()
      if (activeTab) {
        await sendTabMessage(activeTab.id, {
          type: "monocle-alert", 
          level: "error",
          message: "Search failed. Please try again.",
          icon: { type: "lucide", name: "AlertTriangle" }
        })
      }
    }
  }
}
```

### UICommand Key Points:
- **Form opens first** when command is selected
- **User input accessible** via `values` parameter
- **Auto-generated actions**: Configure (instead of Execute), toggle favorite
- **No auto-modifier actions** - handle modifiers in `run()` function
- **Form validation** should be done in the `run()` function

## ParentCommand - Dynamic Children

Commands that generate child commands based on current browser state:

```typescript
interface ParentCommand extends BaseCommand {
  commands: (context: Browser.Context) => Promise<Command[]>
  enableDeepSearch?: boolean                   // Enable deep search (optional)
}
```

### Example: Recent Bookmarks with Error Handling

```typescript
// background/commands/browser/recentBookmarks.ts
import type { ParentCommand, RunCommand } from "../../../types"
import { callBrowserAPI, getActiveTab, sendTabMessage } from "../../utils/browser" 
import { createNoOpCommand } from "../../utils/commands"

export const recentBookmarks: ParentCommand = {
  id: "recent-bookmarks",
  name: "Recent Bookmarks", 
  description: "Navigate to recently added bookmarks",
  icon: { type: "lucide", name: "Bookmark" },
  color: "yellow",
  keywords: ["bookmark", "recent", "favorites"],
  enableDeepSearch: true,  // Allow searching nested bookmarks directly
  
  commands: async (context) => {
    try {
      const bookmarks = await callBrowserAPI("bookmarks", "getRecent", 20)
      
      // Handle empty state
      if (!bookmarks || bookmarks.length === 0) {
        return [
          createNoOpCommand(
            "no-bookmarks",
            "No Recent Bookmarks",
            "No recently added bookmarks found",
            { type: "lucide", name: "BookmarkX" }
          )
        ]
      }
      
      // Convert bookmarks to commands
      return bookmarks
        .filter((bookmark: any) => bookmark.url && bookmark.title)
        .map((bookmark: any): RunCommand => ({
          id: `goto-bookmark-${bookmark.id}`,
          name: bookmark.title,
          description: `Navigate to ${bookmark.url}`,
          icon: { type: "lucide", name: "Globe" },
          color: "blue",
          keywords: ["bookmark", bookmark.title.toLowerCase()],
          
          run: async () => {
            try {
              await callBrowserAPI("tabs", "create", { url: bookmark.url })
              
              const activeTab = await getActiveTab()
              if (activeTab) {
                await sendTabMessage(activeTab.id, {
                  type: "monocle-alert",
                  level: "info", 
                  message: `Opening ${bookmark.title}`,
                  icon: { type: "lucide", name: "ExternalLink" }
                })
              }
            } catch (error) {
              console.error("Failed to open bookmark:", error)
              
              const activeTab = await getActiveTab()
              if (activeTab) {
                await sendTabMessage(activeTab.id, {
                  type: "monocle-alert",
                  level: "error",
                  message: "Failed to open bookmark",
                  icon: { type: "lucide", name: "AlertTriangle" }
                })
              }
            }
          }
        }))
        
    } catch (error) {
      console.error("Failed to load bookmarks:", error)
      
      // Return NoOp error command (don't use alerts for ParentCommand errors)
      return [
        createNoOpCommand(
          "bookmarks-error", 
          "Error Loading Bookmarks",
          "Failed to fetch bookmarks. Please try again.",
          { type: "lucide", name: "AlertTriangle" }
        )
      ]
    }
  }
}
```

### ParentCommand Key Points:
- **Dynamic child generation** based on browser state
- **Error handling with NoOp commands** (not alerts)
- **Deep search support** with `enableDeepSearch: true`
- **Auto-generated actions**: Open (to show children), toggle favorite
- **Child commands get their own actions** when generated

## Deep Search Feature

Enable `enableDeepSearch: true` on ParentCommands to allow users to search nested commands directly:

```typescript
export const bookmarks: ParentCommand = {
  id: "bookmarks",
  name: "Bookmarks", 
  enableDeepSearch: true,  // Users can search "react" to find deeply nested "React Docs"
  commands: async () => {
    // Return nested bookmark structure
    // Deep search will flatten this automatically
  }
}
```

**Benefits:**
- Users can search deeply nested commands without navigation
- Results show breadcrumb paths: `["React Docs", "GitHub", "Development", "Bookmarks"]`
- All command features work (actions, modifiers, keybindings)
- Pre-processed for instant search results

## NoOp Commands for Error States

Use `createNoOpCommand` for display-only error/empty states in ParentCommands:

```typescript
import { createNoOpCommand } from "../../utils/commands"

// In ParentCommand error handling
return [
  createNoOpCommand(
    "error-id",
    "Error Title",
    "Error description with helpful guidance", 
    { type: "lucide", name: "AlertTriangle" }
  )
]
```

**Common patterns:**
- **Empty state**: `"No results found"` with `Search` icon
- **Error state**: `"Unable to load data"` with `AlertTriangle` icon  
- **Permission error**: `"Permission required"` with `Lock` icon
- **Loading state**: `"Loading..."` with `Loader` icon

## Action System & Modifier Keys

Every command automatically gets context-aware actions:

### Auto-Generated Actions:
1. **Primary Action**: 
   - RunCommand: "Execute"
   - ParentCommand: "Open" 
   - UICommand: "Configure"
2. **Modifier Actions** (RunCommand only):
   - "Execute with ⌘/⇧/⌥/⌃" or custom `modifierActionLabel`
3. **Toggle Favorite**: Add/remove from favorites (all commands)

### Browser.Context Parameter:
```typescript
interface Browser.Context {
  url: string                           // Current page URL
  title: string                        // Current page title  
  modifierKey: ModifierKey | null      // Active modifier: "cmd" | "shift" | "alt" | "ctrl"
}
```

Use `context?.modifierKey` to implement different behaviors:
```typescript
run: async (context) => {
  if (context?.modifierKey === "cmd") {
    // Cmd+Enter behavior
  } else if (context?.modifierKey === "shift") {
    // Shift+Enter behavior
  } else {
    // Default Enter behavior
  }
}
```

## Browser API Integration

**Always use the browser abstraction layer:**
```typescript
import { callBrowserAPI, getActiveTab, sendTabMessage } from "../../utils/browser"

// Good - cross-browser compatible
await callBrowserAPI("tabs", "create", { url: "https://example.com" })

// Bad - Chrome-specific  
chrome.tabs.create({ url: "https://example.com" })
```

**Common browser operations:**
```typescript
// Get active tab
const activeTab = await getActiveTab()

// Create new tab  
await callBrowserAPI("tabs", "create", { url: "..." })

// Query tabs
const tabs = await callBrowserAPI("tabs", "query", {})

// Send message to tab (for alerts/actions)
await sendTabMessage(activeTab.id, {
  type: "monocle-alert",
  level: "success",
  message: "Operation completed",
  icon: { type: "lucide", name: "CheckCircle" }
})
```

## Command Registration

### 1. Create Command File
```typescript
// background/commands/category/myCommand.ts
import type { RunCommand } from "../../../types"

export const myCommand: RunCommand = {
  id: "my-command",
  name: "My Command", 
  // ... command definition
}
```

### 2. Register in Category
```typescript
// background/commands/category/index.ts
import { myCommand } from "./myCommand"

export const categoryCommands = [
  // existing commands,
  myCommand
]
```

### 3. Category Registered in Main Index
```typescript
// background/commands/index.ts - already configured
import { categoryCommands } from "./category"

// Categories are automatically loaded
```

## Best Practices

### Naming & Structure:
- **IDs**: kebab-case, descriptive (`"close-current-tab"`)
- **Names**: Clear action verbs (`"Close Current Tab"`)
- **Keywords**: Include synonyms and common terms
- **Colors**: Match action context (red for delete, green for create)

### Error Handling:
- **RunCommand/UICommand errors**: Use alert system for immediate feedback
- **ParentCommand errors**: Use NoOp commands to display error states
- **Always log errors** to console for debugging

### Performance:
- **Async properties**: Use sparingly, evaluated each load
- **ParentCommand children**: Avoid expensive operations
- **Cache when possible**: Store results of expensive API calls

### User Experience:
- **Provide feedback**: Always show success/error messages
- **Use appropriate icons**: Match context and meaning
- **Implement modifier keys**: Power-user shortcuts
- **Test both modes**: Ensure commands work in overlay and new tab

### Cross-Browser Compatibility:
```typescript
export const myCommand: RunCommand = {
  supportedBrowsers: ["chrome", "firefox"], // Specify compatibility
  // or omit to support all browsers
}
```

This architecture ensures commands work identically across both deployment modes while providing rich, context-aware functionality to users.

--- 

Implement the request: $ARGUMENTS