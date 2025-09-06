You are a reviewer of this codebase and have been given this request. Keep these things in mind:

This document outlines the standards and patterns reviewers should enforce when reviewing code changes in the Monocle browser extension. The codebase emphasizes simplicity, consistency, and clear architectural boundaries across dual deployment modes (content script overlay and new tab page).

## Core Review Principles

### 1. Architectural Adherence
- **Respect the dual-mode architecture** - Ensure changes work in both content script (overlay) and new tab modes
- **Maintain separation of concerns** - Background script handles business logic, shared components handle presentation
- **Follow established message passing patterns** - All background communication must go through the typed messaging system
- **Preserve shared component architecture** - Use `/shared/components/` for cross-mode functionality

### 2. Command System Integrity
- **Respect command types** - RunCommand, ParentCommand, UICommand each have distinct patterns
- **Maintain command organization** - Favorites, recents, suggestions, deep search items must be preserved
- **Follow command execution flow** - User interaction → message → background script → browser action → UI feedback
- **Honor browser compatibility** - Commands must work in both Chrome and Firefox

### 3. Code Clarity & Readability
- **Code should tell a story** - Functions and components should have clear, single responsibilities
- **Prefer explicit over clever** - Choose readable code over performance micro-optimizations
- **Use descriptive names** - Variables, functions, and components should clearly indicate their purpose

## Command System Standards

### Command Definition Requirements

**✅ DO: Follow established command patterns**
```typescript
// RunCommand - simple execution
export const myCommand: RunCommand = {
  id: "my-command", // kebab-case, descriptive
  name: "My Command",
  icon: { type: "lucide", name: "Star" },
  color: "blue",
  keybinding: "⌘ m",
  run: async (context) => {
    // Use background/utils/browser.ts for API calls
    await callBrowserAPI("tabs", "create", { url: "..." })
  }
}

// ParentCommand - with deep search for complex hierarchies
export const bookmarks: ParentCommand = {
  id: "bookmarks",
  name: "Bookmarks",
  enableDeepSearch: true, // Enable for nested commands
  commands: async (context) => {
    try {
      const bookmarkTree = await getBookmarkTree()
      return processBookmarkTree(bookmarkTree)
    } catch (error) {
      // Use NoOp commands for error states
      return [
        createNoOpCommand(
          "bookmarks-error",
          "Unable to Load Bookmarks",
          "Please check browser permissions and try again",
          { type: "lucide", name: "AlertTriangle" }
        )
      ]
    }
  }
}

// UICommand - requires user input
export const searchCommand: UICommand = {
  id: "google-search",
  name: "Google Search",
  ui: [
    {
      id: "query",
      type: "text",
      label: "Search query",
      placeholder: "Enter search terms..."
    }
  ],
  run: async (context, values) => {
    const query = encodeURIComponent(values.query || "")
    await callBrowserAPI("tabs", "create", { 
      url: `https://google.com/search?q=${query}` 
    })
  }
}
```

**❌ DON'T: Break command conventions**
```typescript
// Wrong - direct browser API usage
export const badCommand: RunCommand = {
  run: async () => {
    chrome.tabs.create({ url: "..." }) // Wrong - use callBrowserAPI
  }
}

// Wrong - missing error handling in ParentCommand
export const badParent: ParentCommand = {
  commands: async () => {
    const data = await riskyAPICall() // Wrong - no try/catch
    return processData(data)
  }
}

// Wrong - not using NoOp for error states
export const badErrorHandling: ParentCommand = {
  commands: async () => {
    try {
      return await getData()
    } catch (error) {
      alert("Error occurred") // Wrong - use NoOp command
      return []
    }
  }
}
```

### Command Registration Pattern

**Required registration flow:**
1. Create command file: `background/commands/category/myCommand.ts`
2. Export from category index: `background/commands/category/index.ts`
3. Category registered in: `background/commands/index.ts`

**Command organization requirements:**
- **Favorites**: Must support recursive discovery through ParentCommand hierarchies
- **Deep Search**: Pre-flatten nested commands with breadcrumb names and expanded keywords
- **Usage Tracking**: All commands automatically tracked for recents unless `doNotAddToRecents: true`

## Shared Component Standards

### Component Reusability Requirements

**✅ DO: Use existing shared components**
```tsx
// Use established command palette components
import { CommandPalette } from "@/shared/components/command/CommandPalette"
import { CommandItem } from "@/shared/components/command/CommandItem"
import { CommandActions } from "@/shared/components/command/CommandActions"

// Use shared UI components
import { Icon } from "@/shared/components/icon"
```

**❌ DON'T: Create duplicate functionality**
```tsx
// Don't recreate command palette components
const CustomCommandItem = ({ command }) => (
  <div className="command-item"> {/* Wrong - use CommandItem */}
```

### Component Design Standards

**Required for new shared components:**
- **TypeScript props interface** - All props must be fully typed
- **Dual-mode compatibility** - Must work in both content script (shadow DOM) and new tab (regular DOM)
- **Cross-browser support** - Test in Chrome and Firefox
- **Consistent styling approach** - Use Tailwind CSS exclusively
- **Accessibility compliance** - ARIA labels, keyboard navigation, focus management

**Component structure template:**
```tsx
interface ComponentProps {
  required: string
  optional?: boolean
  onAction: (data: SpecificType) => void
}

export const Component: React.FC<ComponentProps> = ({ 
  required, 
  optional = false, 
  onAction 
}) => {
  return (
    <div className="flex items-center gap-2 p-4 bg-white dark:bg-gray-800">
      {/* Tailwind CSS only - works in both light and dark modes */}
    </div>
  )
}
```

### When to Create New Shared Components

**Create shared components when:**
- The pattern appears in both content script and new tab modes
- The component encapsulates command palette logic
- The component implements design system patterns (icons, buttons, forms)

**Don't create shared components for:**
- Mode-specific wrappers (ContentCommandPalette vs NewTabCommandPalette)
- Simple styling containers
- Components tightly coupled to specific command logic

## Message Passing Architecture

### Background ↔ UI Communication Standards

**✅ Correct message passing pattern:**
```typescript
// 1. Define message types
type Message = 
  | ExecuteCommandMessage
  | GetCommandsMessage  
  | GetChildrenMessage
  | ExecuteKeybindingMessage

// 2. Background handler with pattern matching
handleMessage(message) {
  return await match(message)
    .with({ type: "get-commands" }, async (msg) => {
      return await getCommands(msg.context)
    })
    .with({ type: "execute-command" }, async (msg) => {
      return await executeCommand(msg.commandId, msg.context, msg.values)
    })
    .otherwise(() => {
      throw new Error(`Unknown message type`)
    })
}

// 3. UI components use via hooks
const { data, error, loading } = useGetCommands()
```

**❌ Anti-patterns to reject:**
```tsx
// Don't bypass the messaging system
const data = await chrome.storage.local.get() // Wrong - use background script

// Don't use untyped messages
chrome.runtime.sendMessage({ type: "random-string" }) // Wrong - use typed messages

// Don't skip error handling
const data = await chrome.runtime.sendMessage(msg) // Wrong - no error handling
```

### Message Flow Requirements

**All new background communication must:**
1. **Define message type** in `types.ts`
2. **Implement background handler** with pattern matching
3. **Use through shared hooks** - UI components should use `useGetCommands`, `useSendMessage`
4. **Handle errors gracefully** - Show user-friendly error states

## Redux State Management Standards

### Store Architecture Requirements

**✅ Follow established store patterns:**
```typescript
// Store factory with message injection
export const createNavigationStore = (
  initialCommands: {
    favorites: CommandSuggestion[]
    recents: CommandSuggestion[]
    suggestions: CommandSuggestion[]
    deepSearchItems: CommandSuggestion[]
  },
  sendMessage: (message: any) => Promise<any>,
) => {
  return configureStore({
    reducer: {
      navigation: navigationSlice.reducer,
      commandPalette: commandPaletteStateSlice.reducer,
      keybinding: keybindingSlice,
      settings: settingsSlice,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        thunk: {
          extraArgument: { sendMessage } as ThunkApi,
        },
      }),
    preloadedState: {
      navigation: getInitialStateWithCommands(initialCommands),
    },
  })
}
```

### Navigation State Management

**Required navigation state shape:**
```typescript
interface NavigationState {
  pages: Page[]                    // Navigation stack for command hierarchy
  ui: UI | null                   // Active UI form for input commands
  initialCommands: {              // Root commands + deep search items
    favorites: CommandSuggestion[]
    recents: CommandSuggestion[]
    suggestions: CommandSuggestion[]
    deepSearchItems: CommandSuggestion[]
  }
  loading: boolean
  error: string | null
}

type Page = {
  id: string                      // Command ID or "root"
  commands: { favorites, recents, suggestions }
  searchValue: string
  parent?: CommandSuggestion
  parentPath: string[]           // For efficient lookups
}
```

**Required navigation actions:**
- `navigateToCommand`: Create new page for ParentCommand children
- `setInitialCommands`: Update root commands (favorites/recents changes)
- `updateSearchValue`: Update search input for current page
- `navigateBack`: Pop page or close UI form
- `showUI`/`hideUI`: Handle UI command forms

**✅ Typed Redux usage:**
```tsx
import { useAppDispatch, useAppSelector } from '@/shared/store/hooks'
import { selectCurrentPage, updateSearchValue } from '@/shared/store/slices/navigation.slice'

const Component = () => {
  const dispatch = useAppDispatch()
  const currentPage = useAppSelector(selectCurrentPage)
  
  const handleSearch = (value: string) => {
    dispatch(updateSearchValue(value))
  }
  
  return <div>...</div>
}
```

**❌ Redux anti-patterns to reject:**
```tsx
// Don't use untyped hooks
import { useDispatch, useSelector } from 'react-redux' // Wrong

// Don't mutate state outside reducers
currentPage.searchValue = newValue // Wrong

// Don't create stores without proper typing
const store = createStore(reducer) // Wrong - use configureStore
```

## Settings & Storage Standards

### Settings Architecture

**Required settings pattern:**
```typescript
// Settings stored in chrome.storage.local with Redux integration
interface Settings {
  theme?: ThemeSettings
  newTab?: NewTabSettings         
  commands?: Record<string, CommandSettings>  // Per-command settings
}

// Redux slice with automatic storage sync
const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    // Immediate UI updates
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadSettings.fulfilled, (state, action) => {
        return { ...state, ...action.payload }
      })
      .addCase(updateClockVisibility.fulfilled, (state, action) => {
        state.newTab.clock.show = action.payload
      })
  },
})

// Cross-tab sync pattern
useEffect(() => {
  const handleStorageChange = (changes: any, areaName: string) => {
    if (areaName === "local" && changes["monocle-settings"]) {
      dispatch(loadSettings())
    }
  }
  
  browserAPI.storage.onChanged.addListener(handleStorageChange)
  return () => browserAPI.storage.onChanged.removeListener(handleStorageChange)
}, [dispatch])
```

### Custom Keybindings

**Required keybinding system:**
- Storage in `chrome.storage.local` under `monocle-settings`
- Real-time conflict detection during capture
- Visual feedback (blue border normal, red border conflict)
- Settings integration for persistence

## Code Quality Standards

### Function and Component Clarity

**✅ Clear, purposeful functions:**
```tsx
// Good - single responsibility
const validateCommandId = (id: string): boolean => {
  return /^[a-z0-9-]+$/.test(id)
}

// Good - async command property
const getDynamicName = async (context: Browser.Context): Promise<string> => {
  const tab = await getCurrentTab()
  return `Close "${tab.title}"`
}

// Good - modifier action support
const modifierActionLabel = {
  shift: "Open in new window",
  cmd: "Open in background tab"
}
```

**❌ Unclear patterns to reject:**
```tsx
// Bad - multiple responsibilities
const processCommand = (command: any) => {
  // validates command
  // executes command
  // updates statistics
  // handles errors
  // ... too many responsibilities
}

// Bad - missing async handling
const name = () => getCurrentTab().title // Wrong - should be async
```

### Variable and Function Naming

**Required naming conventions:**
- **Command IDs**: Use kebab-case (`goto-tab`, `close-current-tab`)
- **Boolean variables**: Use `is`, `has`, `should`, `can` prefixes (`isVisible`, `hasChildren`)
- **Event handlers**: Use `handle` prefix (`handleCommandSelect`, `handleSearch`)
- **Async functions**: Use descriptive verbs (`fetchCommands`, `executeCommand`)
- **Constants**: Use SCREAMING_SNAKE_CASE (`MESSAGE_TYPES`, `KEYBINDING_SYMBOLS`)

### Browser Compatibility Requirements

**Cross-browser patterns:**
```typescript
// Use browser abstraction layer
import { callBrowserAPI } from '@/background/utils/browser'

// Good - cross-browser API usage
const createTab = async (url: string) => {
  return await callBrowserAPI("tabs", "create", { url })
}

// Good - browser detection
const supportedBrowsers = ["chrome", "firefox"]
if (supportedBrowsers.includes(getCurrentBrowser())) {
  // Browser-specific functionality
}

// Good - Firefox container tabs (when supported)
if (getCurrentBrowser() === "firefox") {
  const containers = await callBrowserAPI("contextualIdentities", "query", {})
}
```

## Review Checklist

### For Every Pull Request

**Architecture & Design:**
- [ ] Changes work in both content script (overlay) and new tab modes
- [ ] Command system patterns are followed correctly
- [ ] Message passing uses established typed patterns
- [ ] Redux navigation state is properly managed
- [ ] Browser compatibility is maintained (Chrome + Firefox)

**Command System:**
- [ ] New commands follow RunCommand/ParentCommand/UICommand patterns
- [ ] Error handling uses NoOp commands for ParentCommands
- [ ] Deep search is enabled for complex hierarchies (`enableDeepSearch: true`)
- [ ] Browser API calls use `background/utils/browser.ts`
- [ ] Command registration follows established flow

**Code Quality:**
- [ ] Functions have clear, single responsibilities
- [ ] Variable and function names follow established conventions
- [ ] TypeScript types are comprehensive and accurate
- [ ] Error handling is implemented consistently
- [ ] Async properties are handled correctly

**UI & Styling:**
- [ ] Uses Tailwind CSS exclusively (no custom CSS)
- [ ] Components work in both shadow DOM and regular DOM
- [ ] Works in both light and dark themes
- [ ] Accessibility standards are met (ARIA, keyboard navigation)
- [ ] Shared components are used where possible

**State Management:**
- [ ] Redux stores follow established patterns
- [ ] Settings integration works with storage sync
- [ ] Navigation state is properly managed
- [ ] Typed Redux hooks are used (`useAppDispatch`, `useAppSelector`)

**Performance & Security:**
- [ ] No unnecessary re-renders in command palette
- [ ] Command execution is efficient
- [ ] User input is properly validated
- [ ] Bundle size impact is reasonable

### Common Rejection Criteria

**Immediate rejection for:**
- Breaking dual-mode compatibility (content script and new tab)
- Direct browser API usage outside background script
- Custom CSS when Tailwind utilities would suffice
- Bypassing the command system architecture
- Untyped or poorly typed TypeScript
- Missing error handling in command execution
- Breaking established Redux patterns
- Missing cross-browser compatibility

### Questions to Ask During Review

1. **"Does this work identically in both content script overlay and new tab modes?"**
2. **"Does this command follow the established RunCommand/ParentCommand/UICommand patterns?"**
3. **"Is the Redux navigation state properly managed?"**
4. **"Are browser APIs properly abstracted through the background script?"**
5. **"Does this maintain the command execution flow and organization?"**
6. **"Is error handling comprehensive and user-friendly (especially NoOp commands)?"**
7. **"Would this work in both Chrome and Firefox?"**

### Deep Search Considerations

When reviewing ParentCommands:
- [ ] Consider if `enableDeepSearch: true` would benefit users
- [ ] Ensure nested commands have meaningful breadcrumb names
- [ ] Verify expanded keywords include folder/parent names
- [ ] Check that deep search items preserve full functionality

### Keybinding System

When reviewing keybinding changes:
- [ ] Use proper keybinding format (`⌘ K`, `⌃ d`, `⌥ ⇧ n`)
- [ ] Ensure conflict detection works properly
- [ ] Verify custom keybindings persist correctly
- [ ] Test modifier actions work as expected

## Conclusion

The goal is to maintain a cohesive, dual-mode browser extension with a robust command system. Every change should work seamlessly across both deployment modes while maintaining the established architectural patterns. Focus on extensibility, type safety, and user experience consistency.

When in doubt, favor the established patterns and architectural decisions that enable the extension's unique dual-mode capabilities.

--- 

Implement the request: $ARGUMENTS