You are taked with maintaining the background commands. Here is some helpful info:

This guide explains how to create new commands for the Monocle browser extension. Commands are the core functionality that users can access through the command palette.

## Table of Contents

1. [Command Types Overview](#command-types-overview)
2. [Simple RunCommand Example](#simple-runcommand-example)
3. [UICommand with Form Example](#uicommand-with-form-example)
4. [ParentCommand with Dynamic Children](#parentcommand-with-dynamic-children)
5. [Alert/Notification Examples](#alertnotification-examples)
6. [Command Properties Glossary](#command-properties-glossary)
7. [Registration and Best Practices](#registration-and-best-practices)

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
      
      // Return error command if API fails
      return [{
        id: "bookmarks-error",
        name: "Error Loading Bookmarks",
        description: "Failed to fetch recent bookmarks",
        icon: { name: "AlertTriangle" },
        color: "red",
        run: async () => {
          const activeTab = await getActiveTab()
          if (activeTab) {
            await sendTabMessage(activeTab.id, {
              type: "monocle-alert",
              level: "error", 
              message: "Could not load recent bookmarks",
              icon: { name: "AlertTriangle" }
            })
          }
        }
      }]
    }
  }
}
```

### Key Features:
- **Dynamic generation**: Child commands created based on live data
- **Async properties**: Names, icons, and colors can be resolved asynchronously
- **Error handling**: Graceful fallback when data fetching fails
- **Context awareness**: Can use execution context to customize behavior

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
| `name`   | `valueOrAsyncExecution<string \| string[]>` | Display name, can be string, array for breadcrumbs, or async function |

### Optional BaseCommand Properties

| Property            | Type                                                | Description                            | Examples                                            |
| ------------------- | --------------------------------------------------- | -------------------------------------- | --------------------------------------------------- |
| `description`       | `valueOrAsyncExecution<string>`                     | Command description shown in UI        | "Opens a new browser tab"                           |
| `icon`              | `valueOrAsyncExecution<Icon>`                       | Icon configuration                     | `{ name: "Plus" }` or `{ url: "path/to/icon.png" }` |
| `color`             | `valueOrAsyncExecution<ColorName \| string>`        | Theme color for the command            | `"red"`, `"blue"`, `"#ff0000"`                      |
| `keywords`          | `valueOrAsyncExecution<string[]>`                   | Search keywords for fuzzy matching     | `["tab", "new", "open"]`                            |
| `keybinding`        | `string`                                            | Keyboard shortcut                      | `"⌘ K"`, `"⌃ d"`, `"⌥ ⇧ n"`                         |
| `priority`          | `(context: ExecutionContext) => Promise<Command[]>` | Function to determine command priority | Used for ranking in suggestions                     |
| `supportedBrowsers` | `SupportedBrowser[]`                                | Browser compatibility                  | `["chrome", "firefox"]`                             |
| `actions`           | `Command[]`                                         | Sub-actions available for the command  | Additional commands shown on hover/focus            |
| `doNotAddToRecents` | `boolean`                                           | Flag to exclude from recent commands   | `true` to prevent recent tracking                   |

### RunCommand & UICommand Specific Properties

| Property              | Type                                                     | Description                     | Examples                                            |
| --------------------- | -------------------------------------------------------- | ------------------------------- | --------------------------------------------------- |
| `actionLabel`         | `valueOrAsyncExecution<string>`                          | Default action label            | `"Execute"`, `"Open"`, `"Search"`                   |
| `modifierActionLabel` | `{[key in ModifierKey]?: valueOrAsyncExecution<string>}` | Action labels for modifier keys | `{ shift: "Open in New Window", cmd: "Copy Link" }` |
| `run`                 | `(context?, values?) => void \| Promise<void>`           | Execution function              | Main command logic                                  |

### UICommand Specific Properties

| Property | Type          | Description            |
| -------- | ------------- | ---------------------- |
| `ui`     | `CommandUI[]` | Form field definitions |

### ParentCommand Specific Properties

| Property   | Type                                                | Description                            |
| ---------- | --------------------------------------------------- | -------------------------------------- |
| `commands` | `(context: ExecutionContext) => Promise<Command[]>` | Function that generates child commands |

### Supported Color Values

**Named Colors:**
`red`, `green`, `blue`, `amber`, `lightBlue`, `gray`, `purple`, `orange`, `teal`, `pink`, `indigo`, `yellow`

**Custom Colors:**
Any valid CSS color value: `"#ff0000"`, `"rgb(255, 0, 0)"`, `"hsl(0, 100%, 50%)"`

### Keybinding Format

- `⌘` = Cmd/Meta key (Mac)
- `⌃` = Ctrl key  
- `⌥` = Alt/Option key
- `⇧` = Shift key

Examples: `"⌘ K"`, `"⌃ d"`, `"⌥ ⇧ n"`, `"⌘ ⇧ p"`

### Modifier Keys

Available in `ExecutionContext.modifierKey`:
- `"shift"` - Shift key pressed
- `"cmd"` - Cmd/Meta key pressed  
- `"alt"` - Alt/Option key pressed
- `"ctrl"` - Ctrl key pressed
- `null` - No modifier key

### Async Property Resolution

Many properties support `valueOrAsyncExecution<T>` which means they can be:

1. **Static value**: `name: "My Command"`
2. **Async function**: `name: async (context) => { return await getTabTitle() }`

This allows commands to dynamically update based on current browser state.

## Registration and Best Practices

### 1. Create Command File

```typescript
// background/commands/category/myCommand.ts
import type { RunCommand } from "../../../types"

export const myCommand: RunCommand = {
  // Command definition here
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
```typescript
run: async (context, values) => {
  try {
    // Your command logic
    await someAsyncOperation()
  } catch (error) {
    console.error(`Error in ${id}:`, error)
    
    // Show error to user
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
export const advancedExample: UICommand = {
  id: "advanced-example",
  name: async (context) => `Advanced Command (${context.url})`,
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
  
  run: async (context, values) => {
    // Implementation with full error handling and user feedback
  }
}
```

--- 

Implement the request: $ARGUMENTS