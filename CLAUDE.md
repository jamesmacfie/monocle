# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Monocle browser extension codebase.

## Project Overview

Monocle is a browser extension built with Extension.js that provides a VS Code-style command palette for browser operations. It operates in two modes: overlay command palette on any webpage (Cmd+Shift+K) and dedicated new tab page.

**Key Features**: Fuzzy search (CMDK), categorized commands (favorites/suggestions), deep search for nested commands, cross-browser compatibility (Chrome/Firefox), Shadow DOM isolation, shared component architecture.

## Architecture

### Directory Structure
```
monocle/
├── background/          # Service worker - command definitions, message handlers, keybindings
├── content/            # Content script - shadow DOM, overlay palette
├── newtab/             # New tab page - standalone palette
└── shared/             # Reusable components, hooks, Redux store, types
```

### Dual-Mode Architecture

**Content Script Mode**: Injected into all pages, shadow DOM isolation, toggles with Cmd+Shift+K
**New Tab Mode**: Always-visible palette, regular DOM, auto-focus

Both modes share the same core `CommandPalette` component from `/shared/components/command/`.

## Command System (Node-Based Model)

### Command Node Types

All commands use a discriminated union type `CommandNode` with a `type` field determining the node kind:

**ActionCommandNode**: Executable command with `execute()` function
```typescript
type: "action"
execute: (context?: Browser.Context, values?: Record<string, string>) => void | Promise<void>
actionLabel?: string
modifierActionLabel?: { [key in ModifierKey]?: string }
keybinding?: string
confirmAction?: boolean
remainOpenOnSelect?: boolean
allowCustomKeybinding?: boolean
```

**GroupCommandNode**: Container for child commands (replaces ParentCommand)
```typescript
type: "group"
children: (context: Browser.Context) => Promise<CommandNode[]>
enableDeepSearch?: boolean  // Makes nested commands searchable at top level
```

**InputCommandNode**: Inline input field rendered as a list item
```typescript
type: "input"
field: FormField  // Text, select, checkbox/switch, radio, color, or multi configuration
```

**DisplayCommandNode**: Static display row (headings, help text)
```typescript
type: "display"
// No additional properties beyond base
```

### Base Properties (All Nodes)

```typescript
interface CommandNodeBase {
  id: string
  name: AsyncValue<string | string[]>
  description?: AsyncValue<string>
  icon?: AsyncValue<CommandIcon>
  color?: AsyncValue<CommandColor | string>
  keywords?: AsyncValue<string[]>
  permissions?: BrowserPermission[]
  supportedBrowsers?: Browser.Platform[]
}
```

### Command Flow

1. User opens palette → UI sends `execute-command` message
2. Background script finds command → executes `execute()` → updates usage stats
3. Browser action performed → UI feedback (close overlay or stay open)

### Inline UI Model

Instead of separate UI overlays, input fields are rendered inline as command items:
- Groups can contain a mix of inputs, actions, and display nodes
- Input values are captured in form state within the navigation slice
- When executing actions, form values are passed to the `execute()` function
- Example: Calculator command has input nodes for the expression and action nodes for calculate/copy

Keyboard interactions for inline inputs are consistent:
- Up/Down: move between command items (delegated to CMDK)
- Escape: focuses the main search input (does not navigate back)
- Backspace: does not bubble (prevents accidental navigate back)
- Left/Right: type-specific behavior
  - Select: cycles previous/next option
  - Radio: moves focus across options; Enter/Space selects (always one selected)
  - Multi: moves focus across options; Enter/Space toggles selection in/out

Implementation note: shared key handling is centralized so all input types behave consistently.

### Command Organization

- **Favorites**: Starred commands with recursive discovery through group hierarchies
- **Suggestions**: All commands, usage-ranked
- **Deep Search Items**: Pre-flattened nested commands from groups with `enableDeepSearch: true`

### Deep Search Feature

Enables searching deeply nested commands (e.g., bookmarks) without navigation. Commands are pre-processed during `getCommands()` and enhanced with:
- Breadcrumb names: `["React Docs", "GitHub", "Development", "Bookmarks"]`
- Expanded keywords including all folder names
- Full feature parity (actions, modifiers, keybindings)

Enable with `enableDeepSearch: true` on GroupCommandNode.

### NoOp Commands

Display-only commands for error/empty states in groups:
```typescript
// background/utils/commands.ts
createNoOpCommand(id: string, name: string, description: string, icon?: CommandIcon)
```

Use for group errors instead of alerts for better UX.

## State Management (Redux)

### Store Architecture

**Navigation Store**: Command palette with pre-loaded command data
**App Store**: Full application state including settings

Key state shape:
```typescript
interface NavigationState {
  pages: Page[]                    // Navigation stack (command hierarchy)
  initialCommands: {              // Root commands + deep search
    favorites: Suggestion[]
    suggestions: Suggestion[]
    deepSearchItems: Suggestion[]
  }
}

type Page = {
  id: string                      // Command ID or "root"
  commands: { favorites, suggestions }
  searchValue: string
  parent?: Suggestion
  parentPath: string[]           // For efficient lookups
  formValues?: Record<string, string | string[]>  // Inline input values (multi stores string[])
}
```

### Key Navigation Actions
- `navigateToCommand`: Create new page for group children
- `setInitialCommands`: Update root commands (favorites changes)
- `updateSearchValue`: Update search input
- `navigateBack`: Pop page
- `setFormValue`: Update inline input value
- `clearFormValues`: Reset form state

Primary interface: `useCommandNavigation` hook maintains consistent API.

## Command Suggestions

The UI uses discriminated union `Suggestion` types with type-specific properties:

### Base Suggestion Properties
```typescript
interface SuggestionBase {
  id: string
  name: string | string[]
  description?: string
  color?: string
  keywords?: string[]
  icon?: CommandIcon
  keybinding?: string
  isFavorite?: boolean
  permissions?: BrowserPermission[]
}
```

### Suggestion Types

**ActionSuggestion** (type: "action"):
```typescript
interface ActionSuggestion extends SuggestionBase {
  type: "action"
  actionLabel: string
  modifierActionLabel?: { [key in ModifierKey]?: string }
  confirmAction?: boolean
  remainOpenOnSelect?: boolean
  executionContext?: ActionExecutionContext
  actions?: Suggestion[]
}
```

**GroupSuggestion** (type: "group"):
```typescript
interface GroupSuggestion extends SuggestionBase {
  type: "group"
  actionLabel: string
  actions?: Suggestion[]
}
```

**InputSuggestion** (type: "input"):
```typescript
interface InputSuggestion extends SuggestionBase {
  type: "input"
  inputField: FormField
  actionLabel?: string
}
```

**DisplaySuggestion** (type: "display"):
```typescript
interface DisplaySuggestion extends SuggestionBase {
  type: "display"
  actionLabel?: string
}
```

### Discriminated Union
```typescript
type Suggestion = 
  | ActionSuggestion
  | GroupSuggestion  
  | InputSuggestion
  | DisplaySuggestion

// Backward compatibility alias
type CommandSuggestion = Suggestion
```

## Messaging System

**Message Types**: `get-commands`, `execute-command`, `get-children-commands`, `execute-keybinding`, `request-permission`

**Browser.Context**: Every command execution includes current page URL, title, and active modifier key.

**Permission Messages**: `request-permission` messages are used in Chrome to route permission requests through the background script for security compliance.

Execution payloads: `execute-command` messages can include array values (from multiselect inputs). The background normalizes any array values to comma-separated strings before invoking a command’s `execute()` so existing commands that expect `Record<string, string>` continue to work. Command authors can split values back into arrays if needed.

## Keybinding System

**Format**: `⌘ K` (Cmd), `⌃ d` (Ctrl), `⌥ ⇧ n` (Alt+Shift)

**Custom Keybindings**: Stored in `chrome.storage.local`, real-time conflict detection, visual feedback during capture.

**Modifier Actions**: Commands can have different behaviors per modifier key:
```typescript
modifierActionLabel: {
  shift: "Open in new window",
  cmd: "Open in background"
}
```

## Permissions System

### Overview

Monocle uses a selective permissions model where commands can opt-in to browser permissions as needed. This minimizes the extension's initial permission footprint while allowing powerful commands when users choose to grant access.

**Permission Types**:
- **Required Permissions**: `activeTab`, `storage` - automatically granted at install time
- **Optional Permissions**: `bookmarks`, `browsingData`, `contextualIdentities`, `cookies`, `downloads`, `history`, `sessions`, `tabs` - requested on-demand

### Command Permission Declaration

Commands specify required permissions using the `permissions` property:

```typescript
export const bookmarks: GroupCommandNode = {
  type: "group",
  id: "bookmarks",
  name: "Bookmarks",
  permissions: ["bookmarks"],  // Required permissions
  children: async () => {
    // Command implementation
  }
}
```

**Available Permissions**:
- `activeTab`: Access to current tab info
- `bookmarks`: Read/write bookmarks
- `browsingData`: Clear browsing data
- `contextualIdentities`: Container tabs (Firefox)
- `cookies`: Read/write cookies
- `downloads`: Access downloads
- `history`: Browse history
- `sessions`: Recently closed tabs/windows
- `storage`: Local storage (auto-granted)
- `tabs`: Tab management

### Permission Flow

1. **Command Selection**: User selects command requiring permissions
2. **Permission Check**: `usePermissionsGranted` hook validates required permissions
3. **Action Menu Fallback**: If permissions missing, action menu shows permission requests instead of command actions
4. **User Grant**: User clicks "Grant X permission" → browser-specific permission request flow → browser shows permission dialog → actions menu closes automatically
5. **State Update**: On grant, `refreshPermissions` thunk updates Redux store from actual browser permissions → UI refreshes to show available actions
6. **Command Execution**: Command runs with granted permissions

#### Browser-Specific Permission Flows

**Firefox**: Permission requests are made directly from the content script using `browser.permissions.request()` (original flow)

**Chrome**: Permission requests are routed through the background script:
- Content script sends `request-permission` message to background
- Background script calls `chrome.permissions.request()` 
- Background returns success/failure result to content script
- Content script updates UI and Redux store accordingly

This approach ensures compatibility with both browsers' permission security models.

### Permission UI Components

**PermissionActions Component**: Displays permission grant options in action menu
- Calls `chrome.permissions.request()` directly from content script
- Maps technical permission names to user-friendly labels
- Auto-closes actions menu after permission dialog
- Triggers `refreshPermissions` thunk and command list reload on success

**usePermissionsGranted Hook**: Checks command permission status
```typescript
const { isGrantedAllPermissions, missingPermissions } = 
  usePermissionsGranted(commandPermissions)
```

### Implementation Details

**Permission Requests**: `PermissionActions` component uses browser-specific flows:
- Firefox: Direct `browser.permissions.request()` calls from content script
- Chrome: Sends `request-permission` message to background script for processing

**Browser Detection**: Uses `shared/utils/browser.ts` for consistent browser detection across components

**Message Types**: Added `RequestPermissionMessage` for Chrome background permission requests

**Permission Storage**: Permissions stored in Redux `settings.slice` with automatic sync to `chrome.storage.local`

**State Synchronization**: After successful grant, `refreshPermissions` thunk updates Redux store from actual browser permissions

**Firefox-Specific Permissions**: `contextualIdentities` permission is Firefox-only and handled appropriately in Chrome

### Developer Guidelines

1. **Minimal Permissions**: Only request permissions your command actually needs
2. **Graceful Degradation**: Handle missing permissions with NoOp commands when appropriate
3. **User Communication**: Use clear descriptions explaining why permissions are needed
4. **Testing**: Test commands both with and without permissions granted

## Browser Compatibility

**API Abstraction**: `background/utils/browser.ts` wraps browser.* vs chrome.* APIs
**Firefox-Specific**: Container tabs support, promise-based APIs, different manifest structure

## Settings & Storage

**Settings**: Redux slice with automatic storage sync via `chrome.storage.local`
**Usage Data**: Recent commands, execution counts, favorites (persistent)
**Cross-Tab Sync**: Storage change listeners update UI across all contexts

Settings pattern:
```typescript
// Load on mount, listen for changes, update via Redux thunks
const showClock = useAppSelector(selectClockVisibility)
dispatch(updateClockVisibility(!showClock))
```

## Adding New Commands

1. Create command file: `background/commands/category/myCommand.ts`
2. Import and use the appropriate node type:
   ```typescript
   import type { ActionCommandNode, GroupCommandNode }from "../../../shared/types"
   
   export const myCommand: ActionCommandNode = {
     type: "action",
     id: "my-command",
     name: "My Command",
     icon: { type: "lucide", name: "Star" },
     execute: async (context, values) => {
       // Implementation
     }
   }
   ```
3. Export from category index: `export const categoryCommands = [existingCommand, myCommand]`
4. Best practices:
   - Always specify `type` discriminant
   - Use `execute` for actions (not `run`)
   - Use `children` for groups (not `commands`)
   - Use descriptive kebab-case IDs
   - Handle errors with NoOp commands for groups
   - Enable `enableDeepSearch` for complex hierarchies
   - Use `background/utils/browser.ts` for API calls
   - Test both Chrome and Firefox
   - Use `FormField` types appropriately:
     - `text`, `select`, `radio`, `color` store strings; `checkbox`/`switch` store "true"/"false" strings
     - `multi` stores `string[]` (background normalizes arrays to comma-separated strings for `execute()`)

## Key Patterns

**Async Properties**: Command properties can be async functions
```typescript
name: async (context) => `Tab: ${await getTabTitle()}`
```

**Dynamic Children**: Groups generate children based on current state
```typescript
children: async () => {
  const tabs = await getAllTabs()
  return tabs.map(tab => createTabCommand(tab))
}
```

**Inline Input Pattern**: Groups with inputs for user interaction
```typescript
export const calculator: GroupCommandNode = {
  type: "group",
  id: "calculator",
  name: "Calculator",
  children: async () => [
    {
      type: "input",
      id: "calc-input",
      name: "Expression",
      field: { id: "calculation", type: "text", placeholder: "e.g. 2+2" }
    },
    {
      type: "action",
      id: "calc-execute",
      name: "Calculate",
      execute: async (context, values) => {
        const result = evaluate(values?.calculation)
        // Handle result
      }
    }
  ]
}
```

**Multiselect Input Pattern**: Multiple options with chip-style toggles and array values
```typescript
export const preferences: GroupCommandNode = {
  type: "group",
  id: "preferences",
  name: "Preferences",
  children: async () => [
    {
      type: "input",
      id: "pref-langs",
      name: "Languages",
      field: {
        id: "languages",
        label: "Languages",
        type: "multi",
        options: [
          { value: "js", label: "JavaScript" },
          { value: "ts", label: "TypeScript" },
          { value: "py", label: "Python" },
        ],
        defaultValue: ["js", "ts"],
      },
    },
    {
      type: "submit",
      id: "save-preferences",
      name: "Save",
      actionLabel: "Save",
      async execute(context, values) {
        // Background normalizes arrays to comma-separated strings for execute()
        // Convert back to an array if needed
        const langs = String(values?.languages || "")
          .split(",")
          .filter(Boolean)
        await saveLanguages(langs)
      },
    },
  ],
}
```

## CSS variables

### Backgrounds
- `--color-bg-page`: Page/background canvas (document/page chrome).
- `--color-surface`: Primary surface (palette, cards, submenus).
- `--color-surface-elevated`: Slightly raised elements (chips, kbd, subtle containers).
- `--color-bg-hover`: List hover/active background.
- `--color-bg-selected`: Selected row/button background.
- `--color-bg-overlay`: Scrim/overlay behind modal palette.
- `--color-bg-input`: Input backgrounds (inline inputs, select control).
- `--color-bg-menu`: Popover/menus (Select menu, submenus).

### Text
- `--color-fg`: Primary text.
- `--color-fg-muted`: Secondary/muted text and metadata.
- `--color-fg-inverse`: Text on dark/colored surfaces (e.g., toasts/hero).
- `--color-fg-placeholder`: Placeholder text.
- `--color-link`: Link text.
- `--color-link-hover`: Link hover.

### Border & Divider
- `--color-border`: Default border/divider.
- `--color-border-strong`: Emphasized/active border.
- `--color-divider`: Very subtle separators.

### Accent & Focus
- `--color-accent`: Primary brand/accent.
- `--color-accent-contrast`: Text/icon on accent surfaces.
- `--color-accent-hover`: Hover tint for accent actions.
- `--color-focus-ring`: Keyboard focus ring/outline.
- `--color-favorite`: Favorite/star accent.
- `--color-icon-accent-start`: Icon background gradient start.
- `--color-icon-accent-end`: Icon background gradient end.

### Status
For each status, provide background (soft), border (mid), and foreground (text/icon):
- `--color-info-bg`, `--color-info-border`, `--color-info-fg`
- `--color-success-bg`, `--color-success-border`, `--color-success-fg`
- `--color-warning-bg`, `--color-warning-border`, `--color-warning-fg`
- `--color-error-bg`, `--color-error-border`, `--color-error-fg`

### Hero (New Tab)
- `--color-hero-start`, `--color-hero-end`: Gradient background stops.
- `--color-hero-overlay`: Foreground scrim over hero/bg images.

## Development

**Commands**: `npm run dev` (Chrome), `npm run dev:firefox`, `npm run build`, `npm run build:firefox`
**Framework**: Extension.js with TypeScript, React, Tailwind CSS, HMR

## Performance Notes

- Shared components between modes reduce bundle size
- Shadow DOM isolation in content mode prevents page reflow  
- Commands resolved on-demand, deep search pre-processed for instant results
- Debounced search, cached command data


## Debugging

**Background Script**: Service worker logs in extension management
**Content Mode**: Browser console + shadow DOM inspection
**New Tab Mode**: Regular DevTools on new tab page
**State**: Inspect `chrome.storage.local` values, use Redux DevTools

Always use `npm`, not `yarn`.
