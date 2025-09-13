You are tasked with maintaining the background commands. Here is some helpful info:

This guide explains how to create new commands for the Monocle browser extension. Commands are the core functionality that users can access through the command palette in both overlay mode (Cmd+K) and new tab mode.

## Command Architecture Overview

Commands in Monocle use a node-based system with discriminated union types. Each command is a `CommandNode` with a `type` field that determines its behavior:

- **ActionCommandNode**: Executable command with an `execute()` function
- **GroupCommandNode**: Container that generates dynamic child commands
- **InputCommandNode**: Inline input field rendered as a list item
- **DisplayCommandNode**: Static display row for headings or help text

All commands work identically in both content script (overlay) and new tab deployment modes.

## Base Properties (All Nodes)

Every command node must have these core properties:

```typescript
interface CommandNodeBase {
  id: string                                    // Unique identifier (kebab-case)
  name: AsyncValue<string | string[]>           // Display name, can be async
  description?: AsyncValue<string>              // Optional description
  icon?: AsyncValue<CommandIcon>                // Icon configuration  
  color?: AsyncValue<ColorName | string>        // Theme color
  keywords?: AsyncValue<string[]>               // Search keywords
  permissions?: BrowserPermission[]             // Required browser permissions
  supportedBrowsers?: Browser.Platform[]        // ["chrome", "firefox"]
}
```

### AsyncValue Pattern

Many properties support `AsyncValue<T>` which means they can be:
- **Static**: `name: "My Command"`
- **Async function**: `name: async (context) => \`Close "\${await getTabTitle()}"\``

This allows commands to be dynamic based on current browser state.

## ActionCommandNode - Executable Commands

The most common command type for actions:

```typescript
interface ActionCommandNode extends CommandNodeBase {
  type: "action"                                              // Required discriminant
  execute: (context?: Browser.Context, values?: Record<string, string>) => void | Promise<void>
  actionLabel?: AsyncValue<string>                           // Default action label
  modifierActionLabel?: { [key in ModifierKey]?: string }   // Modifier key labels
  keybinding?: string                                       // Keyboard shortcut ("⌘ K", "⌃ d")
  confirmAction?: boolean                                   // Require confirmation
  remainOpenOnSelect?: boolean                             // Keep palette open after execution
  allowCustomKeybinding?: boolean                          // Allow user to customize keybinding
  doNotAddToRecents?: boolean                             // Exclude from recent commands
}
```

### Example: Simple Tab Command

```typescript
// background/commands/browser/closeCurrentTab.ts
import type { ActionCommandNode }from "../../../shared/types"
import { queryTabs, removeTab, sendTabMessage } from "../../utils/browser"

export const closeCurrentTab: ActionCommandNode = {
  type: "action",  // Required type discriminant
  id: "close-current-tab",
  name: "Close Current Tab",
  description: "Close the currently active tab",
  icon: { type: "lucide", name: "X" },
  color: "red",
  keywords: ["close", "tab", "shut"],
  keybinding: "⌘ w",
  confirmAction: true,
  
  // Modifier key behavior labels
  modifierActionLabel: {
    shift: "Close All Tabs",
    cmd: "Close Other Tabs"
  },
  
  execute: async (context) => {
    try {
      const tabs = await queryTabs({ active: true, currentWindow: true })
      const activeTab = tabs[0]
      
      if (context?.modifierKey === "shift") {
        // Close all tabs
        const allTabs = await queryTabs({})
        for (const tab of allTabs) {
          if (tab.id) await removeTab(tab.id)
        }
      } else if (context?.modifierKey === "cmd") {
        // Close other tabs
        const allTabs = await queryTabs({ currentWindow: true })
        for (const tab of allTabs) {
          if (tab.id !== activeTab?.id && tab.id) {
            await removeTab(tab.id)
          }
        }
      } else {
        // Close current tab
        if (activeTab?.id) {
          await removeTab(activeTab.id)
        }
      }
      
      // Success feedback
      if (activeTab?.id) {
        await sendTabMessage(activeTab.id, {
          type: "monocle-alert",
          level: "success", 
          message: "Tab closed successfully",
          icon: { type: "lucide", name: "CheckCircle" }
        })
      }
      
    } catch (error) {
      console.error("Failed to close tab:", error)
      
      const tabs = await queryTabs({ active: true, currentWindow: true })
      if (tabs[0]?.id) {
        await sendTabMessage(tabs[0].id, {
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

### ActionCommandNode Key Points:
- **Always specify `type: "action"`** for the discriminant
- **Use `execute` not `run`** for the execution function
- **Immediate execution** when selected
- **Modifier key support** via `context?.modifierKey` 
- **Auto-generated actions**: Execute, modifier variants, toggle favorite
- **Cross-browser compatibility** using browser utils
- **User feedback** via alert system

## GroupCommandNode - Dynamic Children

Commands that generate child commands based on current browser state:

```typescript
interface GroupCommandNode extends CommandNodeBase {
  type: "group"                                               // Required discriminant
  children: (context: Browser.Context) => Promise<CommandNode[]>  // Child generator
  enableDeepSearch?: boolean                                  // Enable deep search (optional)
}
```

### Example: Recent Bookmarks with Error Handling

```typescript
// background/commands/browser/recentBookmarks.ts
import type { GroupCommandNode, ActionCommandNode }from "../../../shared/types"
import { getBookmarkTree, createTab, sendTabMessage } from "../../utils/browser" 
import { createNoOpCommand } from "../../utils/commands"

export const recentBookmarks: GroupCommandNode = {
  type: "group",  // Required type discriminant
  id: "recent-bookmarks",
  name: "Recent Bookmarks", 
  description: "Navigate to recently added bookmarks",
  icon: { type: "lucide", name: "Bookmark" },
  color: "yellow",
  keywords: ["bookmark", "recent", "favorites"],
  permissions: ["bookmarks"],
  enableDeepSearch: true,  // Allow searching nested bookmarks directly
  
  children: async (context) => {
    try {
      const tree = await getBookmarkTree()
      const bookmarks = extractRecentBookmarks(tree)
      
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
      
      // Convert bookmarks to action nodes
      return bookmarks
        .filter((bookmark: any) => bookmark.url && bookmark.title)
        .map((bookmark: any): ActionCommandNode => ({
          type: "action",
          id: `goto-bookmark-${bookmark.id}`,
          name: bookmark.title,
          description: `Navigate to ${bookmark.url}`,
          icon: { type: "lucide", name: "Globe" },
          color: "blue",
          keywords: ["bookmark", bookmark.title.toLowerCase()],
          
          execute: async () => {
            try {
              await createTab({ url: bookmark.url })
              
              const tabs = await queryTabs({ active: true, currentWindow: true })
              if (tabs[0]?.id) {
                await sendTabMessage(tabs[0].id, {
                  type: "monocle-alert",
                  level: "info", 
                  message: `Opening ${bookmark.title}`,
                  icon: { type: "lucide", name: "ExternalLink" }
                })
              }
            } catch (error) {
              console.error("Failed to open bookmark:", error)
              
              const tabs = await queryTabs({ active: true, currentWindow: true })
              if (tabs[0]?.id) {
                await sendTabMessage(tabs[0].id, {
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
      
      // Return NoOp error command (don't use alerts for group errors)
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

### GroupCommandNode Key Points:
- **Always specify `type: "group"`** for the discriminant
- **Use `children` not `commands`** for the child generator
- **Dynamic child generation** based on browser state
- **Children must be CommandNode types** (not legacy Command)
- **Error handling with NoOp commands** (not alerts)
- **Deep search support** with `enableDeepSearch: true`
- **Auto-generated actions**: Open (to show children), toggle favorite

## Inline UI Pattern - Groups with Inputs

Groups can contain input nodes for user interaction:

```typescript
// background/commands/tools/calculator.ts
import type { GroupCommandNode, InputCommandNode, ActionCommandNode }from "../../../shared/types"

export const calculator: GroupCommandNode = {
  type: "group",
  id: "calculator",
  name: "Calculator",
  description: "Evaluate mathematical expressions",
  icon: { type: "lucide", name: "Calculator" },
  color: "green",
  
  children: async () => [
    // Input node for expression
    {
      type: "input",
      id: "calc-expression",
      name: "Expression",
      field: {
        id: "calculation",
        type: "text",
        placeholder: "e.g., 2 + 2, 10 * 5, sqrt(16)",
        required: true
      }
    } as InputCommandNode,
    
    // Action to calculate
    {
      type: "action",
      id: "calc-execute",
      name: "Calculate",
      icon: { type: "lucide", name: "Equal" },
      actionLabel: "Calculate",
      modifierActionLabel: {
        cmd: "Calculate & Copy"
      },
      
      execute: async (context, values) => {
        const expression = values?.calculation
        if (!expression) {
          // Show error
          return
        }
        
        try {
          const result = evaluateExpression(expression)
          
          if (context?.modifierKey === "cmd") {
            // Copy to clipboard
            await navigator.clipboard.writeText(result.toString())
          }
          
          // Show result
          await sendTabMessage(activeTab.id, {
            type: "monocle-alert",
            level: "success",
            message: `${expression} = ${result}`,
            icon: { type: "lucide", name: "Calculator" }
          })
        } catch (error) {
          // Handle error
        }
      }
    } as ActionCommandNode,
    
    // Display node for help text
    {
      type: "display",
      id: "calc-help",
      name: "Supported: +, -, *, /, %, sqrt, pow, abs, round",
      icon: { type: "lucide", name: "Info" }
    } as DisplayCommandNode
  ]
}
```

### Inline UI Key Points:
- **Groups can mix node types**: inputs, actions, and displays
- **Input values passed to actions** via `values` parameter
- **Form state managed automatically** by navigation slice
- **No separate UI overlay** - everything renders inline
- **Display nodes** for static text/help

## Deep Search Feature

Enable `enableDeepSearch: true` on GroupCommandNodes to allow users to search nested commands directly:

```typescript
export const bookmarks: GroupCommandNode = {
  type: "group",
  id: "bookmarks",
  name: "Bookmarks", 
  enableDeepSearch: true,  // Users can search "react" to find deeply nested "React Docs"
  children: async () => {
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

Use `createNoOpCommand` for display-only error/empty states in groups:

```typescript
import { createNoOpCommand } from "../../utils/commands"

// In GroupCommandNode error handling
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
   - ActionCommandNode: "Execute" or custom `actionLabel`
   - GroupCommandNode: "Open" 
   - InputCommandNode: No primary action
   - DisplayCommandNode: No primary action
2. **Modifier Actions** (ActionCommandNode only):
   - "Execute with ⌘/⇧/⌥/⌃" or custom `modifierActionLabel`
3. **Toggle Favorite**: Add/remove from favorites (all commands)
4. **Set/Reset Keybinding**: For commands that allow custom keybindings

### Browser.Context Parameter:
```typescript
interface Browser.Context {
  url: string                           // Current page URL
  title: string                        // Current page title  
  modifierKey: ModifierKey | null      // Active modifier: "cmd" | "shift" | "alt" | "ctrl"
  isNewTab?: boolean                   // Whether in new tab mode
}
```

Use `context?.modifierKey` to implement different behaviors:
```typescript
execute: async (context, values) => {
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
import { queryTabs, createTab, removeTab, sendTabMessage } from "../../utils/browser"

// Good - cross-browser compatible
await createTab({ url: "https://example.com" })

// Bad - Chrome-specific  
chrome.tabs.create({ url: "https://example.com" })
```

**Common browser operations:**
```typescript
// Query tabs
const tabs = await queryTabs({ active: true, currentWindow: true })
const activeTab = tabs[0]

// Create new tab  
await createTab({ url: "..." })

// Remove tab
await removeTab(tabId)

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
import type { ActionCommandNode }from "../../../shared/types"

export const myCommand: ActionCommandNode = {
  type: "action",  // Always specify type
  id: "my-command",
  name: "My Command", 
  execute: async (context, values) => {
    // Implementation
  }
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

### Type Safety:
- **Always specify `type` discriminant** on every node
- **Use `execute` not `run`** for actions
- **Use `children` not `commands`** for groups
- **Import correct types** (`ActionCommandNode`, `GroupCommandNode`, etc.)

### Naming & Structure:
- **IDs**: kebab-case, descriptive (`"close-current-tab"`)
- **Names**: Clear action verbs (`"Close Current Tab"`)
- **Keywords**: Include synonyms and common terms
- **Colors**: Match action context (red for delete, green for create)

### Error Handling:
- **ActionCommandNode errors**: Use alert system for immediate feedback
- **GroupCommandNode errors**: Use NoOp commands to display error states
- **Always log errors** to console for debugging

### Performance:
- **Async properties**: Use sparingly, evaluated each load
- **Group children**: Avoid expensive operations
- **Cache when possible**: Store results of expensive API calls

### User Experience:
- **Provide feedback**: Always show success/error messages
- **Use appropriate icons**: Match context and meaning
- **Implement modifier keys**: Power-user shortcuts
- **Test both modes**: Ensure commands work in overlay and new tab

### Cross-Browser Compatibility:
```typescript
export const myCommand: ActionCommandNode = {
  type: "action",
  supportedBrowsers: ["chrome", "firefox"], // Specify compatibility
  // or omit to support all browsers
  // ...
}
```

### Permissions:
```typescript
export const myCommand: ActionCommandNode = {
  type: "action",
  permissions: ["tabs", "bookmarks"], // Required browser permissions
  // ...
}
```

This architecture ensures commands work identically across both deployment modes while providing rich, context-aware functionality to users.

--- 

Implement the request: $ARGUMENTS