# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with the Monocle browser extension codebase.

## Project Overview

Monocle is a browser extension built with Extension.js that provides a VS Code-style command palette for browser operations. It operates in two modes: overlay command palette on any webpage (Cmd+K) and dedicated new tab page.

**Key Features**: Fuzzy search (CMDK), categorized commands (favorites/recents/suggestions), deep search for nested commands, cross-browser compatibility (Chrome/Firefox), Shadow DOM isolation, shared component architecture.

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

**Content Script Mode**: Injected into all pages, shadow DOM isolation, toggles with Cmd+K
**New Tab Mode**: Always-visible palette, regular DOM, auto-focus

Both modes share the same core `CommandPalette` component from `/shared/components/command/`.

## Command System

### Command Types

All commands extend `BaseCommand` (id, name, icon, color, keywords, keybinding, etc.):

**RunCommand**: Simple execution with `run()` function
```typescript
run: (context?: Browser.Context, values?: Record<string, string>) => void | Promise<void>
actionLabel?: string
modifierActionLabel?: { [key in ModifierKey]?: string }
```

**ParentCommand**: Generates dynamic child commands
```typescript
commands: (context: Browser.Context) => Promise<Command[]>
enableDeepSearch?: boolean  // Makes nested commands searchable at top level
```

**UICommand**: Requires user input via form fields
```typescript
ui: CommandUI[]
run: (context?: Browser.Context, values?: Record<string, string>) => void | Promise<void>
```

### Command Flow

1. User opens palette → UI sends `execute-command` message
2. Background script finds command → executes `run()` → updates usage stats
3. Browser action performed → UI feedback (close overlay or stay open)

### Command Organization

- **Favorites**: Starred commands with recursive discovery through ParentCommand hierarchies
- **Recents**: Auto-tracked recent executions  
- **Suggestions**: All other commands, usage-ranked
- **Deep Search Items**: Pre-flattened nested commands from ParentCommands with `enableDeepSearch: true`

### Deep Search Feature

Enables searching deeply nested commands (e.g., bookmarks) without navigation. Commands are pre-processed during `getCommands()` and enhanced with:
- Breadcrumb names: `["React Docs", "GitHub", "Development", "Bookmarks"]`
- Expanded keywords including all folder names
- Full feature parity (actions, modifiers, keybindings)

Enable with `enableDeepSearch: true` on ParentCommand.

### NoOp Commands

Display-only commands for error/empty states in ParentCommands:
```typescript
// background/utils/commands.ts
createNoOpCommand(id: string, name: string, description: string, icon?: CommandIcon)
```

Use for ParentCommand errors instead of alerts for better UX.

## State Management (Redux)

### Store Architecture

**Navigation Store**: Command palette with pre-loaded command data
**App Store**: Full application state including settings

Key state shape:
```typescript
interface NavigationState {
  pages: Page[]                    // Navigation stack (command hierarchy)
  ui: UI | null                   // Active form for UI commands
  initialCommands: {              // Root commands + deep search
    favorites: CommandSuggestion[]
    recents: CommandSuggestion[]
    suggestions: CommandSuggestion[]
    deepSearchItems: CommandSuggestion[]
  }
}

type Page = {
  id: string                      // Command ID or "root"
  commands: { favorites, recents, suggestions }
  searchValue: string
  parent?: CommandSuggestion
  parentPath: string[]           // For efficient lookups
}
```

### Key Navigation Actions
- `navigateToCommand`: Create new page for ParentCommand children
- `setInitialCommands`: Update root commands (favorites/recents changes)
- `updateSearchValue`: Update search input
- `navigateBack`: Pop page or close UI form
- `showUI`/`hideUI`: Handle UI command forms

Primary interface: `useCommandNavigation` hook maintains same API as previous implementation.

## Messaging System

**Message Types**: `get-commands`, `execute-command`, `get-children-commands`, `execute-keybinding`

**Browser.Context**: Every command execution includes current page URL, title, and active modifier key.

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
export const bookmarks: ParentCommand = {
  id: "bookmarks",
  name: "Bookmarks",
  permissions: ["bookmarks"],  // Required permissions
  commands: async () => {
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
4. **User Grant**: User clicks "Grant X permission" → `chrome.permissions.request()` called directly from content script → browser shows permission dialog → actions menu closes automatically
5. **State Update**: On grant, `refreshPermissions` thunk updates Redux store from actual browser permissions → UI refreshes to show available actions
6. **Command Execution**: Command runs with granted permissions

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

**Permission Requests**: `PermissionActions` component calls `chrome.permissions.request()` directly from content script

**Permission Storage**: Permissions stored in Redux `settings.slice` with automatic sync to `chrome.storage.local`

**State Synchronization**: After successful grant, `refreshPermissions` thunk updates Redux store from actual browser permissions

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
2. Export from category index: `export const categoryCommands = [existingCommand, myCommand]`
3. Best practices:
   - Use descriptive kebab-case IDs
   - Handle errors with NoOp commands for ParentCommands
   - Enable `enableDeepSearch` for complex hierarchies
   - Use `background/utils/browser.ts` for API calls
   - Test both Chrome and Firefox

## Key Patterns

**Async Properties**: Command properties can be async functions
```typescript
name: async (context) => `Tab: ${await getTabTitle()}`
```

**Dynamic Children**: ParentCommands generate children based on current state
```typescript
commands: async () => {
  const tabs = await getAllTabs()
  return tabs.map(tab => createTabCommand(tab))
}
```

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