You are taked with maintaining the background commands. Here is some helpful info:

This guide explains how to create new commands for the Monocle browser extension. Commands are the core functionality that users can access through the command palette.

## Table of Contents

1. [Command Types Overview](#command-types-overview)
2. [Simple RunCommand Example](#simple-runcommand-example)
3. [UICommand with Form Example](#uicommand-with-form-example)
4. [ParentCommand with Dynamic Children](#parentcommand-with-dynamic-children)
5. [NoOp Commands for Error States](#noop-commands-for-error-states)
6. [Deep Search Feature](#deep-search-feature)
7. [Alert/Notification Examples](#alertnotification-examples)
8. [Command Properties Glossary](#command-properties-glossary)
9. [Registration and Best Practices](#registration-and-best-practices)

## Command Types Overview

There are three main types of commands in Monocle, all extending `BaseCommand`:

- **RunCommand**: Simple executable commands with a `run()` function
- **UICommand**: Commands that require user input via form fields
- **ParentCommand**: Commands that generate child commands dynamically

## Simple RunCommand Example

The most basic command type that executes immediately when selected.

### Example: Simple Notification Command

```typescript
// background/commands/tools/simpleNotification.ts
import type { RunCommand } from "../../../types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const simpleNotification: RunCommand = {
  id: "simple-notification",
  name: "Show Simple Notification", 
  description: "Shows a simple success notification",
  icon: { name: "Bell" }, // Lucide React icon name
  color: "green",
  keybinding: "⌘ n", // Optional keyboard shortcut
  keywords: ["notification", "alert", "message"],
  run: async () => {
    const activeTab = await getActiveTab()
    
    if (activeTab) {
      await sendTabMessage(activeTab.id, {
        type: "monocle-alert",
        level: "success",
        message: "Hello from Monocle!",
        icon: { name: "CheckCircle" }
      })
    }
  }
}
```

### Key Features:
- **Immediate execution**: No user input required
- **Browser API integration**: Uses utility functions to interact with tabs
- **Alert system**: Sends notifications back to the browser
- **Optional keybinding**: Allows keyboard shortcuts

## UICommand with Form Example

Commands that require user input before execution.

### Example: Custom Search Command

```typescript
// background/commands/tools/customSearch.ts
import type { UICommand } from "../../../types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

export const customSearch: UICommand = {
  id: "custom-search",
  name: "Custom Search",
  description: "Search any website with custom query",
  icon: { name: "Search" },
  color: "blue",
  keywords: ["search", "query", "find"],
  
  // Form configuration
  ui: [
    {
      id: "query",
      type: "input",
      label: "Search Query", // Optional label
      placeholder: "Enter your search terms...",
      defaultValue: "" // Optional default value
    },
    {
      id: "website",
      type: "input", 
      label: "Website",
      placeholder: "e.g., stackoverflow.com",
      defaultValue: "google.com"
    }
  ],
  
  // Action labels for different contexts
  actionLabel: "Search",
  modifierActionLabel: {
    cmd: "Search in New Window",
    shift: "Search in Private Window"
  },
  
  run: async (context, values) => {
    const activeTab = await getActiveTab()
    const query = values?.query || ""
    const website = values?.website || "google.com"
    
    // Build search URL based on website
    let searchUrl = ""
    if (website.includes("google")) {
      searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`
    } else {
      searchUrl = `https://${website}/search?q=${encodeURIComponent(query)}`
    }
    
    if (activeTab) {
      // Handle modifier keys for different behaviors
      if (context?.modifierKey === "cmd") {
        // Open in new window
        await sendTabMessage(activeTab.id, {
          type: "monocle-newTab",
          url: searchUrl
        })
      } else if (context?.modifierKey === "shift") {
        // Open in private window - would need additional browser API calls
        console.log("Opening in private window:", searchUrl)
      } else {
        // Regular new tab
        await sendTabMessage(activeTab.id, {
          type: "monocle-newTab", 
          url: searchUrl
        })
      }
      
      // Show confirmation alert
      await sendTabMessage(activeTab.id, {
        type: "monocle-alert",
        level: "success",
        message: `Searching for "${query}" on ${website}`,
        icon: { name: "ExternalLink" }
      })
    }
  }
}
```

### Form Field Types:
- **`input`**: Text input field with placeholder and default value
- **`text`**: Display-only text (for instructions or labels)

### Key Features:
- **Form validation**: Access user input via `values` parameter
- **Modifier actions**: Different behavior based on pressed modifier keys
- **Dynamic behavior**: Customize execution based on user input

## ParentCommand with Dynamic Children

Commands that generate child commands dynamically based on current browser state or external data.

### Example: Recent Bookmarks Command

```typescript
// background/commands/browser/recentBookmarks.ts
import type { ParentCommand, RunCommand } from "../../../types"
import { callBrowserAPI, getActiveTab, sendTabMessage } from "../../utils/browser"
import { createNoOpCommand } from "../../utils/commands"

export const recentBookmarks: ParentCommand = {
  id: "recent-bookmarks",
  name: "Go to Recent Bookmark",
  description: "Navigate to a recently added bookmark",
  icon: { name: "Bookmark" },
  color: "yellow",
  keywords: ["bookmark", "favorite", "saved"],
  
  // Generate child commands dynamically
  commands: async (context) => {
    try {
      // Fetch recent bookmarks using browser API
      const bookmarks = await callBrowserAPI("bookmarks", "getRecent", 10)
      
      return bookmarks
        .filter((bookmark: any) => bookmark.url && bookmark.title)
        .map((bookmark: any): RunCommand => ({
          id: `goto-bookmark-${bookmark.id}`,
          
          // Async name resolution
          name: async () => bookmark.title,
          
          description: async () => `Navigate to ${bookmark.url}`,
          
          // Dynamic icon based on bookmark URL
          icon: async () => {
            if (bookmark.url.includes('github')) {
              return { name: "Github" }
            } else if (bookmark.url.includes('stackoverflow')) {
              return { name: "MessageSquare" }
            } else {
              return { name: "Globe" }
            }
          },
          
          // Dynamic color based on bookmark type
          color: async () => {
            if (bookmark.url.includes('github')) return "purple"
            if (bookmark.url.includes('stackoverflow')) return "orange" 
            return "blue"
          },
          
          keywords: ["bookmark", "navigate", bookmark.title.toLowerCase()],
          
          run: async () => {
            const activeTab = await getActiveTab()
            
            if (activeTab) {
              await sendTabMessage(activeTab.id, {
                type: "monocle-newTab",
                url: bookmark.url
              })
              
              await sendTabMessage(activeTab.id, {
                type: "monocle-alert",
                level: "info",
                message: `Opening ${bookmark.title}`,
                icon: { name: "ExternalLink" }
              })
            }
          }
        }))
        
    } catch (error) {
      console.error("Failed to load bookmarks:", error)
      
      // Return NoOp error command instead of showing alerts
      return [
        createNoOpCommand(
          "bookmarks-error",
          "Error Loading Bookmarks",
          "Failed to fetch recent bookmarks. Please try again.",
          { name: "AlertTriangle" }
        )
      ]
    }
  }
}
```

### Key Features:
- **Dynamic generation**: Child commands created based on live data
- **Async properties**: Names, icons, and colors can be resolved asynchronously
- **Error handling**: Graceful fallback when data fetching fails
- **Context awareness**: Can use execution context to customize behavior

## NoOp Commands for Error States

NoOp (No Operation) commands are special commands used to display error states, empty states, or informational messages in the command palette without performing any action when selected. They provide a better user experience than showing alerts for error conditions.

### The createNoOpCommand Utility

The extension provides a `createNoOpCommand` utility function for creating these display-only commands:

```typescript
// background/utils/commands.ts
export function createNoOpCommand(
  id: string,
  name: string,
  description: string,
  icon: CommandIcon = { type: "lucide", name: "Info" }
): Command
```

### Example: Error Handling in ParentCommand

Instead of showing alerts for errors, return NoOp commands that display the error state:

```typescript
// background/commands/browser/myBookmarks.ts
import type { ParentCommand } from "../../../types"
import { callBrowserAPI } from "../../utils/browser"
import { createNoOpCommand } from "../../utils/commands"

export const myBookmarks: ParentCommand = {
  id: "my-bookmarks",
  name: "My Bookmarks",
  description: "Access your browser bookmarks",
  icon: { name: "Bookmark" },
  color: "yellow",
  
  commands: async () => {
    try {
      const bookmarks = await callBrowserAPI("bookmarks", "getTree")
      
      // Handle empty state
      if (!bookmarks || bookmarks.length === 0) {
        return [
          createNoOpCommand(
            "no-bookmarks",
            "No bookmarks found",
            "No bookmarks available",
            { type: "lucide", name: "BookmarkX" }
          )
        ]
      }
      
      // Process bookmarks normally
      return processBookmarks(bookmarks)
      
    } catch (error) {
      console.error("Failed to load bookmarks:", error)
      
      // Return error state command instead of showing alert
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

### Common NoOp Command Patterns

#### Empty State
```typescript
createNoOpCommand(
  "no-results",
  "No results found",
  "No items match your criteria",
  { type: "lucide", name: "Search" }
)
```

#### Loading State
```typescript
createNoOpCommand(
  "loading",
  "Loading...",
  "Fetching data, please wait",
  { type: "lucide", name: "Loader" }
)
```

#### Error State  
```typescript
createNoOpCommand(
  "fetch-error",
  "Unable to load data",
  "Check your connection and try again",
  { type: "lucide", name: "AlertTriangle" }
)
```

#### Permission Error
```typescript
createNoOpCommand(
  "permission-denied",
  "Permission Required",
  "This feature requires additional browser permissions",
  { type: "lucide", name: "Lock" }
)
```

#### Feature Unavailable
```typescript
createNoOpCommand(
  "feature-unavailable",
  "Feature Not Available",
  "This feature is not supported in your browser",
  { type: "lucide", name: "XCircle" }
)
```

### Best Practices for NoOp Commands

**Use NoOp commands instead of alerts for:**
- Empty state messages
- Error conditions in ParentCommands
- Loading states
- Permission errors
- Feature availability messages

**NoOp Command Guidelines:**
- Use descriptive IDs that indicate the state: `"no-bookmarks"`, `"tab-error"`
- Provide clear, user-friendly names and descriptions
- Choose appropriate icons that match the message type:
  - `AlertTriangle` for errors
  - `Search` or `X` for empty results  
  - `Lock` for permission issues
  - `Info` for general information
- Use `gray` color (default) for most NoOp commands
- Keep descriptions actionable when possible ("Try again", "Check settings")

**Color and Icon Recommendations:**

| State Type | Icon | Color | Example |
|------------|------|--------|---------|
| Error | `AlertTriangle`, `XCircle` | `red` | Connection failed |
| Empty | `Search`, `FileX` | `gray` | No results found |
| Loading | `Loader`, `Clock` | `blue` | Fetching data... |
| Permission | `Lock`, `Shield` | `amber` | Permission required |
| Info | `Info`, `MessageCircle` | `gray` | Feature unavailable |

### When NOT to Use NoOp Commands

Don't use NoOp commands for:
- **Success messages** - Use alerts for positive feedback
- **Action confirmations** - Use alerts to confirm completed actions
- **Interactive content** - NoOp commands don't perform actions
- **Single-time notifications** - Use alerts for temporary messages

### Example: Complete Error Handling Pattern

```typescript
export const advancedParentCommand: ParentCommand = {
  id: "advanced-parent",
  name: "Advanced Parent Command",
  
  commands: async (context) => {
    try {
      // Attempt to fetch data
      const data = await fetchSomeData()
      
      if (!data) {
        return [createNoOpCommand(
          "no-data",
          "No Data Available", 
          "No items found",
          { type: "lucide", name: "FileX" }
        )]
      }
      
      if (data.length === 0) {
        return [createNoOpCommand(
          "empty-results",
          "Empty Results",
          "No items match your criteria", 
          { type: "lucide", name: "Search" }
        )]
      }
      
      // Process data normally
      return data.map(item => createCommandFromItem(item))
      
    } catch (error) {
      console.error("Data fetch failed:", error)
      
      if (error.message.includes('permission')) {
        return [createNoOpCommand(
          "permission-error",
          "Permission Required",
          "Please grant necessary permissions",
          { type: "lucide", name: "Lock" }
        )]
      }
      
      return [createNoOpCommand(
        "fetch-error", 
        "Unable to Load Data",
        "Please check your connection and try again",
        { type: "lucide", name: "AlertTriangle" }
      )]
    }
  }
}
```

This pattern ensures users always see helpful information in the command palette, even when things go wrong, without intrusive alert popups.

## Deep Search Feature

The deep search feature allows users to search for deeply nested commands directly from the top level, without navigating through parent command hierarchies. This is particularly useful for commands like bookmarks, where users can type "react" and find "React Documentation" even if it's buried in "Bookmarks → Development → GitHub → React Documentation".

### Enabling Deep Search

To enable deep search on a `ParentCommand`, add the `enableDeepSearch: true` property:

```typescript
// background/commands/browser/bookmarks.ts
export const bookmarks: ParentCommand = {
  id: "bookmarks",
  name: "Bookmarks",
  description: "Access your browser bookmarks",
  icon: { name: "Bookmark" },
  color: "yellow",
  keywords: ["bookmarks", "favorites", "saved", "links"],
  enableDeepSearch: true, // Enable deep search for this parent command
  commands: async () => {
    // Your bookmark tree logic
    const bookmarkTree = await getBookmarkTree()
    return bookmarkTree
  }
}
```

### How Deep Search Works

When `enableDeepSearch: true` is set on a `ParentCommand`:

1. **Background Processing**: The system recursively walks through all child commands during the initial `getCommands()` call
2. **Breadcrumb Generation**: Each nested command gets enhanced with breadcrumb names showing its path
3. **Keyword Enhancement**: Search keywords include all folder names in the path
4. **Instant Results**: Deep search items appear immediately when typing because they're pre-loaded

### Example: Deep Search Enabled Bookmarks

```typescript
// background/commands/browser/myBookmarks.ts
import type { ParentCommand, RunCommand } from "../../../types"
import { callBrowserAPI } from "../../utils/browser"

export const myBookmarks: ParentCommand = {
  id: "my-bookmarks",
  name: "My Bookmarks",
  description: "Browse bookmarks with deep search",
  icon: { name: "Bookmark" },
  color: "yellow",
  keywords: ["bookmarks", "favorites", "links"],
  enableDeepSearch: true, // This enables deep search functionality
  
  commands: async () => {
    const bookmarks = await callBrowserAPI("bookmarks", "getTree")
    
    // Convert bookmark tree to nested commands
    const convertBookmarkNode = (node: any): RunCommand | ParentCommand => {
      if (node.url) {
        // Leaf bookmark - becomes a RunCommand
        return {
          id: `bookmark-${node.id}`,
          name: node.title,
          description: `Open ${node.url}`,
          icon: { name: "Globe" },
          color: "blue",
          keywords: [node.title.toLowerCase(), node.url],
          run: async () => {
            // Open bookmark logic
            await callBrowserAPI("tabs", "create", { url: node.url })
          }
        }
      } else {
        // Folder - becomes a nested ParentCommand
        return {
          id: `bookmark-folder-${node.id}`,
          name: node.title,
          description: `Bookmark folder: ${node.title}`,
          icon: { name: "Folder" },
          color: "yellow",
          keywords: [node.title.toLowerCase()],
          // Inherit deep search from parent
          enableDeepSearch: true,
          commands: async () => {
            return node.children?.map(convertBookmarkNode) || []
          }
        }
      }
    }
    
    return bookmarks[0].children?.map(convertBookmarkNode) || []
  }
}
```

### Deep Search Results

When users search with deep search enabled, they'll see results like:

- **Name**: `["React Documentation", "GitHub", "Development", "Bookmarks"]`
- **Searchable by**: "react", "documentation", "github", "development", "bookmarks"
- **Full Features**: Action menus (Alt+click), keyboard shortcuts, modifier actions all work

### Performance Considerations

- **Pre-processing**: Deep search items are processed once during `getCommands()` and cached
- **Memory Usage**: Large bookmark trees create more deep search items in memory
- **Search Speed**: Instant results because no additional network requests are made during search

### When to Use Deep Search

**Good candidates for deep search:**
- **Bookmarks**: Users often know the bookmark name but not the folder structure
- **Settings/Preferences**: Nested configuration options that users want to find quickly  
- **File/Document hierarchies**: When users search by content name rather than location
- **Menu systems**: Deep navigation structures that benefit from direct access

**Not recommended for:**
- **Simple parent commands** with only 2-3 children
- **Commands with expensive child generation** (deep search processes all children upfront)
- **Frequently changing data** that would cause excessive re-processing

### Technical Implementation

The deep search system:

1. **Scans commands** for `enableDeepSearch: true` during `getCommands()`
2. **Recursively processes** child commands using `flattenDeepSearchCommands()`
3. **Creates enhanced commands** with breadcrumb names and expanded keywords
4. **Returns in single response** as `deepSearchItems` alongside regular commands
5. **Integrates with UI** to show deep search results when users type in the search box

This architecture ensures optimal performance by processing the command tree once and providing instant search results without additional API calls.

## Alert/Notification Examples

The extension provides several ways to send feedback to users through the alert system.

### Alert Types and Usage

```typescript
// Different alert levels
await sendTabMessage(activeTab.id, {
  type: "monocle-alert",
  level: "success", // "info" | "warning" | "success" | "error"
  message: "Operation completed successfully!",
  icon: { name: "CheckCircle" }, // Optional custom icon
  copyText: "Text to copy when alert is clicked" // Optional
})

// Info alert
await sendTabMessage(activeTab.id, {
  type: "monocle-alert",
  level: "info",
  message: "Processing your request...",
  icon: { name: "Info" }
})

// Warning alert
await sendTabMessage(activeTab.id, {
  type: "monocle-alert", 
  level: "warning",
  message: "This action cannot be undone",
  icon: { name: "AlertTriangle" }
})

// Error alert
await sendTabMessage(activeTab.id, {
  type: "monocle-alert",
  level: "error", 
  message: "Failed to complete operation",
  icon: { name: "XCircle" }
})
```

### Copy to Clipboard

```typescript
// Direct clipboard copy
await sendTabMessage(activeTab.id, {
  type: "monocle-copyToClipboard",
  message: "Text copied to clipboard!"
})

// Alert with copy functionality
await sendTabMessage(activeTab.id, {
  type: "monocle-alert",
  level: "success",
  message: "UUID Generated: 123e4567-e89b-12d3-a456-426614174000",
  copyText: "123e4567-e89b-12d3-a456-426614174000", // Click alert to copy
  icon: { name: "Copy" }
})
```

### New Tab/Navigation

```typescript
// Open URL in new tab
await sendTabMessage(activeTab.id, {
  type: "monocle-newTab",
  url: "https://example.com"
})
```

## Command Properties Glossary

### Required Properties

| Property | Type                                        | Description                                                           |
| -------- | ------------------------------------------- | --------------------------------------------------------------------- |
| `id`     | `string`                                    | Unique identifier for the command (kebab-case recommended)            |
| `name`   | `AsyncValue<string \| string[]>`            | Display name, can be string, array for breadcrumbs, or async function |

### Optional BaseCommand Properties

| Property            | Type                                                | Description                            | Examples                                            |
| ------------------- | --------------------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| `description`       | `AsyncValue<string>`                                | Command description shown in UI        | "Opens a new browser tab"                           |
| `icon`              | `AsyncValue<Icon>`                                  | Icon configuration                     | `{ name: "Plus" }` or `{ url: "path/to/icon.png" }` |
| `color`             | `AsyncValue<ColorName \| string>`                   | Theme color for the command            | `"red"`, `"blue"`, `"#ff0000"`                      |
| `keywords`          | `AsyncValue<string[]>`                              | Search keywords for fuzzy matching     | `["tab", "new", "open"]`                            |
| `keybinding`        | `string`                                            | Keyboard shortcut                      | `"⌘ K"`, `"⌃ d"`, `"⌥ ⇧ n"`                         |
| `priority`          | `(context: Browser.Context) => Promise<Command[]>`  | Function to determine command priority | Used for ranking in suggestions                     |
| `supportedBrowsers` | `Browser.Platform[]`                                | Browser compatibility                  | `["chrome", "firefox"]`                             |
| `actions`           | `Command[]`                                         | Sub-actions available for the command  | Additional commands shown on hover/focus            |
| `doNotAddToRecents` | `boolean`                                           | Flag to exclude from recent commands   | `true` to prevent recent tracking                   |

### RunCommand & UICommand Specific Properties

| Property              | Type                                                     | Description                     | Examples                                            |
| --------------------- | -------------------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| `actionLabel`         | `AsyncValue<string>`                                     | Default action label            | `"Execute"`, `"Open"`, `"Search"`                   |
| `modifierActionLabel` | `{[K in Browser.ModifierKey]?: AsyncValue<string>}`      | Action labels for modifier keys | `{ shift: "Open in New Window", cmd: "Copy Link" }` |
| `run`                 | `(context?: Browser.Context, values?: Record<string, string>) => void \| Promise<void>` | Execution function | Main command logic |

### UICommand Specific Properties

| Property | Type          | Description            |
| -------- | ------------- | ---------------------- |
| `ui`     | `CommandUI[]` | Form field definitions |

### ParentCommand Specific Properties

| Property          | Type                                                | Description                            |
| ----------------- | --------------------------------------------------- | -------------------------------------- |
| `commands`        | `(context: Browser.Context) => Promise<Command[]>`  | Function that generates child commands |
| `enableDeepSearch` | `boolean`                                           | Enable deep search for nested commands (optional, default: false) |

### Supported Color Values

**Named Colors:**
`red`, `green`, `blue`, `amber`, `lightBlue`, `gray`, `purple`, `orange`, `teal`, `pink`, `indigo`, `yellow`

**Custom Colors:**
Any valid CSS color value: `"#ff0000"`, `"rgb(255, 0, 0)"`, `"hsl(0, 100%, 50%)"`

**Note:** The new type system supports both `ColorName` and custom string values through the `AsyncValue<ColorName | string>` type.

### Keybinding Format

- `⌘` = Cmd/Meta key (Mac)
- `⌃` = Ctrl key  
- `⌥` = Alt/Option key
- `⇧` = Shift key

Examples: `"⌘ K"`, `"⌃ d"`, `"⌥ ⇧ n"`, `"⌘ ⇧ p"`

### Modifier Keys

Available in `Browser.Context.modifierKey`:
- `"shift"` - Shift key pressed
- `"cmd"` - Cmd/Meta key pressed  
- `"alt"` - Alt/Option key pressed
- `"ctrl"` - Ctrl key pressed
- `null` - No modifier key

### Async Property Resolution

Many properties support `AsyncValue<T>` which means they can be:

1. **Static value**: `name: "My Command"`
2. **Async function**: `name: async (context: Browser.Context) => { return await getTabTitle() }`

This allows commands to dynamically update based on current browser state. The `context` parameter provides access to the current page's URL, title, and any active modifier keys.

## Registration and Best Practices

### 1. Create Command File

```typescript
// background/commands/category/myCommand.ts
import type { RunCommand, Browser } from "../../../types"

export const myCommand: RunCommand = {
  id: "my-command",
  name: "My Command",
  description: "Description of what this command does",
  icon: { name: "Star" },
  color: "blue",
  keywords: ["my", "command"],
  run: async (context?: Browser.Context, values?: Record<string, string>) => {
    // Command implementation here
  }
}
```

### 2. Register in Category Index

```typescript  
// background/commands/category/index.ts
import { myCommand } from "./myCommand"

export const categoryCommands = [
  // existing commands,
  myCommand, // Add your command here
]
```

### 3. Best Practices

**Naming Conventions:**
- Use kebab-case for IDs: `"close-current-tab"`
- Use descriptive names: `"Close Current Tab"` not `"Close"`
- Include category in ID for uniqueness: `"browser-close-tab"`

**Error Handling:**

For RunCommand and UICommand errors, use alerts to provide immediate feedback:
```typescript
run: async (context?: Browser.Context, values?: Record<string, string>) => {
  try {
    // Your command logic
    await someAsyncOperation()
  } catch (error) {
    console.error(`Error in command:`, error)
    
    // Show error alert for immediate feedback
    const activeTab = await getActiveTab()
    if (activeTab) {
      await sendTabMessage(activeTab.id, {
        type: "monocle-alert",
        level: "error",
        message: "Operation failed. Please try again.",
        icon: { name: "AlertTriangle" }
      })
    }
  }
}
```

For ParentCommand errors, use NoOp commands instead of alerts:
```typescript
commands: async (context) => {
  try {
    const data = await fetchData()
    return processData(data)
  } catch (error) {
    console.error("Failed to load data:", error)
    
    // Return NoOp command for error state
    return [
      createNoOpCommand(
        "data-error",
        "Unable to Load Data",
        "Please check your connection and try again",
        { name: "AlertTriangle" }
      )
    ]
  }
}
```

**Browser Compatibility:**
```typescript
export const myCommand: RunCommand = {
  // ... other properties
  supportedBrowsers: ["chrome"], // Only show in Chrome
  // or 
  supportedBrowsers: ["chrome", "firefox"], // Show in both
  // or omit property to support all browsers
}
```

**Note:** The `supportedBrowsers` property now uses the `Browser.Platform[]` type for better type safety.

**Performance:**
- Use async properties sparingly - they're evaluated each time commands are loaded
- Cache expensive operations when possible
- Avoid heavy computations in `priority` functions

**User Experience:**
- Provide clear, descriptive names and descriptions
- Use appropriate icons and colors for context
- Include relevant keywords for search
- Handle errors gracefully with user-friendly messages
- Use modifier actions for power-user features

### Example: Complete Command with All Features

```typescript
import type { UICommand, Browser } from "../../../types"

export const advancedExample: UICommand = {
  id: "advanced-example",
  name: async (context: Browser.Context) => `Advanced Command (${context.url})`,
  description: "A comprehensive example showing all features",
  icon: { name: "Zap" },
  color: async () => Math.random() > 0.5 ? "blue" : "purple",
  keywords: ["advanced", "example", "demo"],
  keybinding: "⌘ ⇧ a",
  supportedBrowsers: ["chrome", "firefox"],
  doNotAddToRecents: false,
  
  ui: [
    {
      id: "input1",
      type: "input",
      label: "Primary Input",
      placeholder: "Enter value...",
      defaultValue: "default"
    }
  ],
  
  actionLabel: "Execute",
  modifierActionLabel: {
    shift: "Execute in Background",
    cmd: "Execute and Copy Result"
  },
  
  actions: [
    {
      id: "sub-action",
      name: "Sub Action",
      icon: { name: "Star" },
      color: "amber",
      run: async () => {
        console.log("Sub action executed")
      }
    }
  ],
  
  run: async (context?: Browser.Context, values?: Record<string, string>) => {
    // Implementation with full error handling and user feedback
    console.log('Context:', context)
    console.log('Values:', values)
  }
}
```

--- 

Implement the request: $ARGUMENTS