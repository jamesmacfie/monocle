# Phase 4: Remove Legacy Code

## Overview

This final phase completes the migration to the UI-centric architecture by removing the legacy command system and associated infrastructure. The extension will now operate purely through the new UINode/UIAction system, with simplified codebase and improved maintainability.

## Architectural Cleanup

**Removing**: 
- Legacy `Command`, `RunCommand`, `ParentCommand`, `UICommand` types
- `CommandSuggestion` conversion system
- `CommandToUIAdapter` (no longer needed)
- CMDK-based CommandPalette components
- Dual-system message handlers

**Keeping**:
- Pure UINode type system
- UIRenderer and component library
- Background script action handlers
- UI state management hooks
- Settings system (ComponentSettings, SettingsSchema, settings action handlers)

## End Goals

By the end of Phase 4:

1. **Clean codebase** with only UI-centric types and components
2. **Simplified message system** with only UI messages
3. **Improved performance** without legacy system overhead
4. **Future-ready architecture** for advanced features
5. **Complete documentation** of the new system

## Cleanup Strategy

### 1. Remove Legacy Type Definitions

#### Update `types.ts`

**Before**:
```typescript
// Legacy command types
export type BaseCommand = { /* ... */ };
export type RunCommand = BaseCommand & { /* ... */ };
export type ParentCommand = BaseCommand & { /* ... */ };
export type UICommand = BaseCommand & { /* ... */ };
export type Command = RunCommand | ParentCommand | UICommand;
export type CommandSuggestion = { /* ... */ };

// Legacy messages
export type ExecuteCommandMessage = { /* ... */ };
export type GetCommandsMessage = { /* ... */ };
export type GetChildrenMessage = { /* ... */ };

// New UI types
export * from './types/ui';
export * from './types/messages';
```

**After**:
```typescript
// Keep only essential shared types
export type ModifierKey = "shift" | "cmd" | "alt" | "ctrl";
export type SupportedBrowser = "chrome" | "firefox";
export type ColorName = "red" | "green" | "blue" | /* ... */;
export type Icon = {
  name?: keyof typeof icons;
  url?: string;
};

// Execution context still needed for browser operations
export interface ExecutionContext {
  url: string;
  title: string;
  modifierKey: ModifierKey | null;
}

// Pure UI-centric system
export * from './types/ui';
export * from './types/messages';

// Remove legacy exports
// export * from './adapters/commandToUI'; // Delete this
```

### 2. Remove Legacy Components

#### Delete Old Command Palette Files

```bash
# Remove legacy command palette components
rm shared/components/command/CommandPalette.tsx
rm shared/components/command/CommandItem.tsx
rm shared/components/command/CommandList.tsx
rm shared/components/command/CommandHeader.tsx
rm shared/components/command/CommandFooter.tsx
rm shared/components/command/CommandActions.tsx
rm shared/components/command/CommandName.tsx

# Remove legacy hooks
rm shared/hooks/useGetCommands.tsx
rm shared/hooks/useCommandNavigation.tsx
rm shared/hooks/useActionLabel.tsx

# Remove adapter system
rm -rf adapters/

# Remove legacy types
rm shared/types/command.ts
```

#### Update CommandPaletteUI

**Simplified version without legacy support**:
```typescript
// shared/components/CommandPaletteUI.tsx
import * as React from "react";
const { useEffect, useCallback, useState } = React;
import { UIRenderer } from "./UIRenderer";
import { useSendMessage } from "../hooks/useSendMessage";
import { useGlobalKeybindings } from "../../content/hooks/useGlobalKeybindings";
import type { UINode, UIAction, UIContext } from "../../types/ui";

interface CommandPaletteUIProps {
  isAlwaysVisible?: boolean;
  onClose?: () => void;
  className?: string;
  autoFocus?: boolean;
}

export const CommandPaletteUI: React.FC<CommandPaletteUIProps> = ({
  isAlwaysVisible = false,
  onClose,
  className = "",
  autoFocus = false
}) => {
  const sendMessage = useSendMessage();
  const [uiRoot, setUIRoot] = useState<UINode | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Enable global keybindings
  useGlobalKeybindings();

  // Load initial UI from background script
  useEffect(() => {
    const loadUI = async () => {
      try {
        setIsLoading(true);
        const response = await sendMessage({
          type: "get-ui",
          context: {
            currentNodeId: "root",
            navigationPath: [],
            focusedNodeId: "root",
            formValues: {},
            modifierKeys: []
          }
        });
        
        if (response.rootNode) {
          setUIRoot(response.rootNode);
        }
      } catch (error) {
        console.error("[CommandPaletteUI] Error loading UI:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadUI();
  }, [sendMessage]);

  // Handle UI actions
  const handleUIAction = useCallback(async (action: UIAction, context: UIContext) => {
    try {
      const response = await sendMessage({
        type: "ui-action",
        action: action.handler,
        context
      });

      // Handle UI updates from response
      if (response.type === "ui-update" && response.updates) {
        // Apply updates to current UI tree
        // Implementation depends on chosen state management approach
      }

      // Handle navigation
      if (response.type === "ui-navigate") {
        // Handle navigation instructions
      }

      // Close palette if action succeeded and closeable
      if (response.success && !isAlwaysVisible && onClose) {
        onClose();
      }
    } catch (error) {
      console.error("[CommandPaletteUI] Error executing UI action:", error);
    }
  }, [isAlwaysVisible, onClose, sendMessage]);

  const handleClose = useCallback(() => {
    if (!isAlwaysVisible && onClose) {
      onClose();
    }
  }, [isAlwaysVisible, onClose]);

  if (isLoading) {
    return (
      <div className={`${className} ui-loading`}>
        <div className="ui-skeleton">Loading...</div>
      </div>
    );
  }

  if (!uiRoot) {
    return (
      <div className={`${className} ui-error`}>
        <div className="ui-error-message">Failed to load command palette</div>
      </div>
    );
  }

  return (
    <div className={className}>
      <UIRenderer 
        node={uiRoot}
        onAction={handleUIAction}
        onClose={handleClose}
        autoFocus={autoFocus}
      />
    </div>
  );
};
```

### 3. Simplify Background Script

#### Update Message Handler

**Remove legacy message handling**:
```typescript
// background/messages/index.ts
import type { UIMessage, UIResponse } from '../../types/messages';
import { UIGenerator } from '../ui/generator';
import { handleUIAction } from '../actions';

const uiGenerator = new UIGenerator();

export const handleMessage = async (message: UIMessage): Promise<UIResponse> => {
  try {
    switch (message.type) {
      case "get-ui":
        // Generate initial UI
        const rootNode = await uiGenerator.generateRootUI(message.context);
        return {
          type: "ui-response",
          success: true,
          rootNode
        };

      case "ui-action":
        // Handle UI actions
        return await handleUIAction(message.action, message.context);

      default:
        return {
          type: "ui-error",
          success: false,
          error: {
            nodeId: message.context?.currentNodeId || "unknown",
            error: {
              message: "Unknown message type",
              details: `Message type ${message.type} is not supported`,
              recoverable: false
            }
          }
        };
    }
  } catch (error) {
    console.error("[Background] Message handling error:", error);
    return {
      type: "ui-error",
      success: false,
      error: {
        nodeId: message.context?.currentNodeId || "unknown",
        error: {
          message: "Internal error",
          details: error.message,
          recoverable: true
        }
      }
    };
  }
};

// Set up message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(error => {
      console.error("[Background] Unhandled error:", error);
      sendResponse({
        type: "ui-error",
        success: false,
        error: {
          nodeId: "unknown",
          error: {
            message: "Critical error",
            details: "An unexpected error occurred",
            recoverable: false
          }
        }
      });
    });

  return true; // Keep message channel open for async response
});
```

#### Simplified UI Generator

**Remove command dependency**:
```typescript
// background/ui/generator.ts
import type { UINode, UIContext, ListNode } from '../../types/ui';
import { tabOperationsUI } from '../ui-generators/tabs';
import { browserOperationsUI } from '../ui-generators/browser';
import { searchOperationsUI } from '../ui-generators/search';
import { toolOperationsUI } from '../ui-generators/tools';

export class UIGenerator {
  /**
   * Generate the root command palette UI
   */
  async generateRootUI(context: UIContext): Promise<UINode> {
    const rootNode: ListNode = {
      id: "command-palette-root",
      type: "list",
      props: {
        searchable: true,
        emptyMessage: "No commands available"
      },
      search: {
        searchContext: "always",
        deepSearch: true,
        deepSearchLabel: "Commands",
        searchTargets: [
          { field: "label", weight: 10 },
          { field: "description", weight: 7 },
          { field: "keywords", weight: 5 }
        ]
      },
      nodes: [
        // Generate UI for different operation categories
        await tabOperationsUI.generateCategoryUI(),
        await browserOperationsUI.generateCategoryUI(),
        await searchOperationsUI.generateCategoryUI(),
        await toolOperationsUI.generateCategoryUI(),
        
        // Add settings and favorites
        await this.generateSettingsUI(),
        await this.generateFavoritesUI()
      ]
    };

    return rootNode;
  }

  /**
   * Generate settings UI
   */
  private async generateSettingsUI(): Promise<UINode> {
    return {
      id: "settings",
      type: "list-item",
      props: {
        label: "Settings",
        description: "Configure extension behavior",
        icon: { name: "Settings" },
        color: "gray",
        keywords: ["settings", "preferences", "config"]
      },
      search: { navigatable: true },
      actions: [{
        id: "open-settings",
        label: "Open Settings",
        type: "primary",
        handler: {
          type: "action",
          actionId: "generate-settings-ui",
          params: {}
        },
        children: [] // Will be populated by action handler
      }]
    };
  }

  /**
   * Generate favorites UI  
   */
  private async generateFavoritesUI(): Promise<UINode> {
    // Implementation for favorites management
    return {
      id: "favorites",
      type: "list-item",
      props: {
        label: "Favorites",
        description: "Manage favorite commands",
        icon: { name: "Star" },
        color: "yellow"
      },
      search: { navigatable: true },
      actions: [{
        id: "manage-favorites",
        label: "Manage Favorites",
        type: "primary",
        handler: {
          type: "action",
          actionId: "generate-favorites-ui",
          params: {}
        }
      }]
    };
  }
}
```

### 4. Create Clean UI Generators

#### Organized UI Generator Structure

```typescript
// background/ui-generators/tabs.ts
export const tabOperationsUI = {
  async generateCategoryUI(): Promise<UINode> {
    return {
      id: "tab-operations",
      type: "list-item",
      props: {
        label: "Tab Operations",
        description: "Manage browser tabs",
        icon: { name: "Tab" },
        color: "blue",
        keywords: ["tabs", "browser", "window"]
      },
      search: { 
        navigatable: true,
        deepSearch: true,
        deepSearchLabel: "Tab Operations"
      },
      actions: [{
        id: "show-tab-operations",
        label: "Show Tab Operations",
        type: "primary",
        handler: { type: "noop" },
        children: await this.generateTabOperationsList()
      }]
    };
  },

  async generateTabOperationsList(): Promise<UINode[]> {
    return [
      await this.generateSwitchTabUI(),
      await this.generateCloseTabUI(),
      await this.generateNewTabUI(),
      await this.generateBulkTabOperationsUI()
    ];
  },

  async generateSwitchTabUI(): Promise<UINode> {
    return {
      id: "switch-tab",
      type: "list-item",
      props: {
        label: "Go to Tab",
        description: "Switch to any open tab",
        icon: { name: "ArrowRight" },
        keywords: ["switch", "goto", "tab", "navigate"]
      },
      search: { navigatable: true },
      actions: [{
        id: "show-tabs",
        label: "Show Tabs",
        type: "primary",
        handler: {
          type: "action",
          actionId: "generate-tab-list",
          params: {}
        }
      }]
    };
  },

  // ... other tab operation generators
};
```

### 5. Update Message Types

#### Simplified Message System

```typescript
// types/messages.ts
export type UIMessage = 
  | GetUIMessage
  | UIActionMessage;

export interface GetUIMessage {
  type: "get-ui";
  context: UIContext;
}

export interface UIActionMessage {
  type: "ui-action";
  action: ActionHandler;
  context: UIContext;
  nodeStates?: Record<string, UINodeState>;
}

export type UIResponse =
  | UISuccessResponse
  | UIUpdateResponse
  | UINavigateResponse
  | UIErrorResponse;

export interface UISuccessResponse {
  type: "ui-response";
  success: true;
  rootNode?: UINode;
}

export interface UIUpdateResponse {
  type: "ui-update";
  success: true;
  updates: UIUpdate[];
}

export interface UINavigateResponse {
  type: "ui-navigate";
  success: true;
  navigation: NavigationInstruction;
}

export interface UIErrorResponse {
  type: "ui-error";
  success: false;
  error: UIError;
}

// Remove all legacy message types:
// - ExecuteCommandMessage ❌
// - GetCommandsMessage ❌  
// - GetChildrenMessage ❌
// - CommandSuggestion ❌
```

## Implementation Steps

### Step 1: Remove Legacy Types
1. **Update `types.ts`** to remove all command-related types
2. **Delete adapter files** and related utilities
3. **Fix TypeScript compilation** errors from removed types

### Step 2: Remove Legacy Components  
1. **Delete old CommandPalette** and related components
2. **Simplify CommandPaletteUI** to only use UIRenderer
3. **Remove legacy hooks** and utilities

### Step 3: Simplify Background Script
1. **Update message handlers** to only handle UI messages
2. **Remove command system** and related code
3. **Create organized UI generators** for different categories

### Step 4: Clean Up and Test
1. **Remove unused files** and dependencies
2. **Update build scripts** if needed
3. **Test full functionality** with new system only
4. **Performance test** and optimize

### Step 5: Documentation Update
1. **Update CLAUDE.md** to reflect new architecture
2. **Create migration guide** for future developers
3. **Document new command creation process**

## Benefits of Cleanup

After Phase 4:

1. **Simplified Architecture**: Single, consistent UI system
2. **Better Performance**: No dual-system overhead  
3. **Easier Maintenance**: Less code, clearer structure
4. **Enhanced Features**: Full power of UI-centric approach
5. **Future-Ready**: Foundation for advanced features

## File Structure After Cleanup

```
bifocal/
├── background/
│   ├── index.ts                  # Entry point
│   ├── messages/
│   │   └── index.ts             # UI message handling only
│   ├── actions/                 # Action handlers
│   │   ├── index.ts
│   │   ├── tabs.ts
│   │   ├── browser.ts
│   │   ├── search.ts
│   │   └── settings.ts          # Settings action handlers
│   ├── ui-generators/           # UI generation
│   │   ├── tabs.ts
│   │   ├── browser.ts
│   │   ├── search.ts
│   │   └── tools.ts
│   └── utils/
│       └── browser.ts
├── shared/
│   ├── components/
│   │   ├── UIRenderer.tsx       # Main renderer
│   │   ├── CommandPaletteUI.tsx # Simplified palette
│   │   └── ui-components/       # UI component library
│   │       ├── index.ts
│   │       ├── ListComponent.tsx
│   │       ├── ListItemComponent.tsx
│   │       ├── CheckboxComponent.tsx # Settings checkbox component
│   │       ├── SettingsFormGenerator.tsx # Settings form generator
│   │       └── ... (other components)
│   ├── hooks/
│   │   ├── useUIState.tsx       # UI state management
│   │   ├── useSendMessage.tsx   # Messaging
│   │   └── useSearch.tsx        # Search functionality
│   └── types/                   # Shared types
├── types/
│   ├── ui.ts                    # UI types
│   └── messages.ts              # Message types
└── types.ts                     # Main type exports (clean)
```

## Success Criteria

Phase 4 is complete when:

1. ✅ **All legacy code removed** successfully
2. ✅ **TypeScript compilation** clean without errors
3. ✅ **Full functionality** working with UI system only
4. ✅ **Performance improved** or maintained
5. ✅ **Codebase simplified** and well-organized
6. ✅ **Documentation updated** for new system

The extension now operates on a pure UI-centric architecture, providing a solid foundation for future enhancements while being easier to maintain and extend.

## Future Enhancements Enabled

With the clean architecture, the extension can now easily support:

- **Advanced UI Patterns**: Rich forms, wizards, dashboards
- **Real-time Updates**: Live data and progress indicators  
- **Custom Themes**: UI-based theming system
- **Plugin System**: Third-party UI components
- **Analytics**: UI interaction tracking
- **Accessibility**: Enhanced keyboard and screen reader support

The migration is now complete, and the extension is ready for its next phase of evolution.