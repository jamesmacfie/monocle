# Phase 1: Add UI Types Alongside Existing Architecture

## Overview

This phase introduces the new UI-centric architecture alongside the existing command-based system. The goal is to establish the foundation for infinitely nestable UI components while maintaining backward compatibility with the current command palette functionality.

## Architectural Relevance

The current Bifocal extension uses a command-centric approach where:
- Commands define behavior and UI structure together
- UI is tightly coupled to command execution
- Limited nesting capabilities (actions are shallow)
- Background script directly executes browser operations

The new UI architecture separates concerns:
- **UI Structure**: Defined by UINodes that describe what to render
- **Interaction Logic**: Handled by UIActions that trigger backend operations
- **Data Flow**: Backend sends complete UI trees, frontend renders them
- **State Management**: Clear separation between UI state and business logic

## End Goals

By the end of Phase 1, you will have:

1. **New type definitions** for the UI-centric architecture
2. **Adapter functions** to convert existing commands to UINodes
3. **Coexistence setup** where both systems can operate simultaneously
4. **Foundation** for future phases without breaking existing functionality

## Key Changes

### 1. New Type System

Create new type definitions that support the UI-first approach:

#### Core UI Types (`types/ui.ts`)

```typescript
// Base UINode structure - the fundamental building block
export interface UINode<T = any> {
  id: string;
  type: UINodeType;
  props?: T;
  nodes?: UINode[];  // Child nodes for UI structure
  actions?: UIAction[];
  state?: UINodeState;
  navigation?: NavigationConfig;
  search?: SearchConfig;
  navigatable?: boolean;  // Can this node be focused/selected?
  settings?: ComponentSettings;  // Component-specific settings configuration
}

// All supported UI node types
export type UINodeType = 
  | "container"
  | "list" 
  | "list-item"
  | "form"
  | "input"
  | "textarea"
  | "select"
  | "checkbox"
  | "radio"
  | "button"
  | "text"
  | "divider"
  | "grid"
  | "stack"
  | "image"
  | "icon"
  | "progress"
  | "skeleton"
  | "error"
  | "empty";

// Unified action system
export interface UIAction {
  id: string;
  label: string;
  icon?: Icon;
  keybinding?: string;
  type: "primary" | "secondary" | "modifier";
  modifierKey?: ModifierKey;
  handler: ActionHandler;
  children?: UINode[] | string;  // Content to render when selected
  submenu?: UIAction[];
}

// Action handlers - backend operations only
export type ActionHandler = 
  | { type: "execute"; commandId: string; params?: Record<string, any> }
  | { type: "submit-form"; formId: string }
  | { type: "action"; actionId: string; params?: any }
  | { type: "copy"; text: string }
  | { type: "open-url"; url: string }
  | { type: "noop" };

// Interactive state management
export interface UINodeState {
  selected?: boolean;
  focused?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  readonly?: boolean;
  value?: any;
  loading?: LoadingState;
  error?: ErrorState;
}

export interface LoadingState {
  active: boolean;
  message?: string;
  progress?: number;
  showSkeleton?: boolean;
  skeletonConfig?: {
    lines?: number;
    height?: string;
  };
}

export interface ErrorState {
  message: string;
  details?: string;
  recoverable?: boolean;
  retryAction?: UIAction;
}

// Navigation and search configuration
export interface NavigationConfig {
  orientation?: "horizontal" | "vertical" | "grid";
  wrap?: boolean;
  tabOrder?: string[];
}

export interface SearchConfig {
  searchable?: boolean;
  searchContext?: "always" | "never" | "auto";
  searchTargets?: SearchTarget[];
  deepSearch?: boolean;
  deepSearchLabel?: string;
}

export interface SearchTarget {
  field: "label" | "description" | "content" | "keywords" | "alt";
  weight?: number;
}

// Component settings configuration
export interface ComponentSettings {
  id: string;  // Settings namespace (e.g., "bookmarks", "calculator")
  version?: number;  // For settings migration
  schema?: SettingsSchema;  // Schema defining available settings
  defaults?: Record<string, any>;  // Default values for settings
}

export interface SettingsSchema {
  properties: Record<string, SettingDefinition>;
  required?: string[];
}

export interface SettingDefinition {
  type: "string" | "number" | "boolean" | "select";
  title: string;
  description?: string;
  default?: any;
  options?: Array<{ value: any; label: string }>;  // For select type
  min?: number;  // For number type
  max?: number;
}
```

#### Type-Specific Props

```typescript
// Props for specific node types
export interface ListProps {
  searchable?: boolean;
  emptyMessage?: string;
}

export interface ListItemProps {
  label: string;
  description?: string;
  icon?: Icon;
  color?: ColorName;
  badges?: Array<{
    text: string;
    color?: ColorName;
    variant?: "solid" | "outline" | "ghost";
  }>;
  accessory?: UINode;
  keywords?: string[];
}

export interface TextProps {
  content: string;  // Markdown supported
  truncate?: boolean;
  maxLines?: number;
}

export interface InputProps {
  label?: string;
  placeholder?: string;
  type?: "text" | "password" | "email" | "number" | "url";
  required?: boolean;
  autoFocus?: boolean;
  defaultValue?: string;
}

export interface ButtonProps {
  label: string;
  variant?: "primary" | "secondary" | "destructive" | "ghost";
  size?: "small" | "medium" | "large";
  icon?: Icon;
}

export interface ContainerProps {
  title?: string;
  description?: string;
  padding?: boolean;
  scrollable?: boolean;
}

export interface StackProps {
  direction?: "horizontal" | "vertical";
  spacing?: "none" | "small" | "medium" | "large";
  align?: "start" | "center" | "end" | "stretch";
}

export interface GridProps {
  columns?: number;
  gap?: "small" | "medium" | "large";
}

export interface SelectProps {
  label?: string;
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
  required?: boolean;
}

export interface CheckboxProps {
  label: string;
  description?: string;
  defaultValue?: boolean;
}

// Properly typed UINode variants
export type ContainerNode = UINode<ContainerProps>;
export type ListNode = UINode<ListProps>;
export type ListItemNode = UINode<ListItemProps>;
export type TextNode = UINode<TextProps>;
export type InputNode = UINode<InputProps>;
export type ButtonNode = UINode<ButtonProps>;
export type StackNode = UINode<StackProps>;
export type GridNode = UINode<GridProps>;
export type SelectNode = UINode<SelectProps>;
export type CheckboxNode = UINode<CheckboxProps>;
```

#### Message Types (`types/messages.ts`)

```typescript
// Frontend to backend messages
export interface UIRequest {
  type: "ui-action";
  action: ActionHandler;
  context: UIContext;
  nodeStates?: Record<string, UINodeState>;
}

export interface UIContext {
  currentNodeId: string;
  navigationPath: string[];
  focusedNodeId: string;
  formValues?: Record<string, any>;
  modifierKeys?: ModifierKey[];
  searchQuery?: string;
  viewport?: {
    visibleNodeIds: string[];
    scrollPosition: number;
  };
}

// Backend to frontend messages
export interface UIResponse {
  type: "ui-update" | "ui-error" | "ui-navigate";
  requestId?: string;
  updates?: UIUpdate[];
  error?: UIError;
  navigation?: NavigationInstruction;
}

export interface UIUpdate {
  type: "replace" | "append" | "prepend" | "remove" | "patch" | "state";
  nodeId: string;
  node?: UINode;
  patches?: Partial<UINode>;
  state?: Partial<UINodeState>;
}

export interface UIError {
  nodeId: string;
  error: ErrorState;
  fallbackUI?: UINode;
}

export interface NavigationInstruction {
  targetNodeId: string;
  action: "push" | "replace" | "pop";
  focusChildId?: string;
}

// Settings message types
export interface SettingsRequest {
  type: "get-settings" | "set-settings";
  componentId?: string;  // If undefined, returns global settings
  settings?: Record<string, any>;
}

export interface SettingsResponse {
  type: "settings-data";
  componentId?: string;
  settings: Record<string, any>;
  schema?: SettingsSchema;
}
```

### 2. Adapter System

Create adapters to convert existing commands to the new UI format:

#### Command to UINode Adapter (`adapters/commandToUI.ts`)

```typescript
import type { Command, CommandSuggestion } from '../types';
import type { UINode, ListNode, ListItemNode } from '../types/ui';

export class CommandToUIAdapter {
  /**
   * Convert the current command data structure to UINode format
   */
  static async convertCommandData(commandData: {
    favorites: CommandSuggestion[];
    recents: CommandSuggestion[];
    suggestions: CommandSuggestion[];
  }): Promise<UINode> {
    const rootNode: ListNode = {
      id: "command-palette-root",
      type: "list",
      props: {
        searchable: true,
        emptyMessage: "No commands found"
      },
      search: {
        searchContext: "always",
        searchTargets: [
          { field: "label", weight: 10 },
          { field: "description", weight: 5 },
          { field: "keywords", weight: 3 }
        ]
      },
      nodes: [
        // Convert favorites
        ...commandData.favorites.map(cmd => this.convertCommandSuggestionToUINode(cmd, "favorite")),
        // Convert recents  
        ...commandData.recents.map(cmd => this.convertCommandSuggestionToUINode(cmd, "recent")),
        // Convert suggestions
        ...commandData.suggestions.map(cmd => this.convertCommandSuggestionToUINode(cmd, "suggestion"))
      ]
    };

    return rootNode;
  }

  /**
   * Convert a CommandSuggestion to a ListItemNode
   */
  static convertCommandSuggestionToUINode(
    suggestion: CommandSuggestion, 
    category: "favorite" | "recent" | "suggestion"
  ): ListItemNode {
    const displayName = Array.isArray(suggestion.name) 
      ? suggestion.name[0] 
      : suggestion.name;

    const node: ListItemNode = {
      id: suggestion.id,
      type: "list-item",
      props: {
        label: displayName,
        description: suggestion.description,
        icon: suggestion.icon,
        color: suggestion.color,
        keywords: suggestion.keywords,
        badges: category === "favorite" 
          ? [{ text: "★", color: "yellow" }] 
          : undefined
      },
      navigatable: true,
      search: {
        searchTargets: [
          { field: "label", weight: 10 },
          { field: "description", weight: 5 },
          { field: "keywords", weight: 3 }
        ]
      },
      actions: this.convertCommandActions(suggestion)
    };

    return node;
  }

  /**
   * Convert CommandSuggestion actions to UIActions
   */
  static convertCommandActions(suggestion: CommandSuggestion): UIAction[] {
    const actions: UIAction[] = [];

    // Primary action - execute the command
    actions.push({
      id: `execute-${suggestion.id}`,
      label: suggestion.actionLabel || "Execute",
      type: "primary",
      handler: {
        type: "execute",
        commandId: suggestion.id,
        params: {}
      }
    });

    // Modifier actions
    if (suggestion.modifierActionLabel) {
      Object.entries(suggestion.modifierActionLabel).forEach(([key, label]) => {
        actions.push({
          id: `execute-${suggestion.id}-${key}`,
          label: label,
          type: "modifier",
          modifierKey: key as ModifierKey,
          handler: {
            type: "execute", 
            commandId: suggestion.id,
            params: { modifierKey: key }
          }
        });
      });
    }

    // Convert nested actions if they exist
    if (suggestion.actions) {
      suggestion.actions.forEach(action => {
        actions.push({
          id: action.id,
          label: action.name as string,
          type: "secondary",
          icon: action.icon,
          handler: {
            type: "execute",
            commandId: action.id,
            params: {}
          }
        });
      });
    }

    return actions;
  }

  /**
   * Convert UI command with form fields to UINode with form
   */
  static convertUICommandToForm(command: Command): UINode | null {
    if (!('ui' in command)) return null;

    const formNode: UINode = {
      id: `${command.id}-form`,
      type: "form",
      search: {
        searchContext: "never"
      },
      nodes: command.ui.map(field => {
        switch (field.type) {
          case "input":
            return {
              id: field.id,
              type: "input" as const,
              props: {
                label: field.label,
                placeholder: field.placeholder,
                defaultValue: field.defaultValue,
                type: "text"
              },
              navigatable: true
            };
          case "text":
            return {
              id: field.id,
              type: "text" as const,
              props: {
                content: field.label || ""
              },
              navigatable: false
            };
          default:
            return {
              id: field.id,
              type: "text" as const,
              props: { content: "Unsupported field type" },
              navigatable: false
            };
        }
      }),
      actions: [{
        id: `submit-${command.id}`,
        label: "Execute",
        type: "primary",
        handler: {
          type: "submit-form",
          formId: command.id
        }
      }]
    };

    return formNode;
  }
}
```

### 3. Integration Points

#### Update Types Export (`types.ts`)

Add the new UI types alongside existing command types:

```typescript
// Existing command types remain unchanged
export * from './types';

// New UI types
export * from './types/ui';
export * from './types/messages';

// Adapter utilities
export * from './adapters/commandToUI';
```

#### Background Script Integration

Create a new UI generator alongside the existing command system:

```typescript
// background/ui/generator.ts
import type { UINode, UIRequest, UIResponse, UIContext } from '../../types/ui';
import { CommandToUIAdapter } from '../../adapters/commandToUI';
import { getCommands, executeCommand } from '../commands';

export class UIGenerator {
  /**
   * Generate the main command palette UI
   */
  async generateCommandPaletteUI(context: UIContext): Promise<UINode> {
    // Get existing command data
    const commandData = await getCommands();
    
    // Convert to UI format using adapter
    const uiNode = await CommandToUIAdapter.convertCommandData(commandData);
    
    return uiNode;
  }

  /**
   * Handle UI actions and return updates
   */
  async handleAction(action: UIAction, context: UIContext): Promise<UIResponse> {
    switch (action.handler.type) {
      case "execute":
        // Delegate to existing command execution system
        try {
          await executeCommand(
            action.handler.commandId, 
            { url: "", title: "", modifierKey: null }, // Basic context
            action.handler.params || {}
          );
          
          return {
            type: "ui-update",
            updates: []  // Command executed successfully, no UI updates needed
          };
        } catch (error) {
          return {
            type: "ui-error",
            error: {
              nodeId: context.currentNodeId,
              error: {
                message: "Command execution failed",
                details: error.message,
                recoverable: true
              }
            }
          };
        }

      case "noop":
        // No operation - just render children if provided
        return {
          type: "ui-navigate",
          navigation: {
            targetNodeId: context.focusedNodeId,
            action: "push"
          }
        };

      default:
        return {
          type: "ui-error",
          error: {
            nodeId: context.currentNodeId,
            error: {
              message: "Unsupported action type",
              details: `Action type ${action.handler.type} is not implemented`,
              recoverable: false
            }
          }
        };
    }
  }
}
```

#### Message Handler Updates

Extend the existing message handler to support UI messages:

```typescript
// background/messages/index.ts

import { UIGenerator } from '../ui/generator';

// Add to existing message handler
const uiGenerator = new UIGenerator();

export const handleMessage = async (message: Message): Promise<any> => {
  // Existing message handling remains unchanged
  if (message.type === "get-commands") {
    // ... existing code
  }
  
  // New UI message handling
  if (message.type === "ui-action") {
    const uiMessage = message as UIRequest;
    return await uiGenerator.handleAction(uiMessage.action, uiMessage.context);
  }

  // Settings message handling
  if (message.type === "get-settings") {
    const settingsMessage = message as SettingsRequest;
    return await getComponentSettings(settingsMessage.componentId);
  }
  
  if (message.type === "set-settings") {
    const settingsMessage = message as SettingsRequest;
    return await setComponentSettings(settingsMessage.componentId, settingsMessage.settings);
  }

  // ... rest of existing handlers
};
```

## Implementation Steps

### Step 1: Create Type Definitions

1. **Create `types/ui.ts`** with all the UI type definitions
2. **Create `types/messages.ts`** with message passing types  
3. **Update main `types.ts`** to export new types alongside existing ones

### Step 2: Build Adapter System

1. **Create `adapters/commandToUI.ts`** with the CommandToUIAdapter class
2. **Test the adapter** by converting existing command data to UI format
3. **Validate the conversion** maintains all existing functionality

### Step 3: Background Script Integration

1. **Create `background/ui/generator.ts`** with UIGenerator class
2. **Integrate with existing command system** through executeCommand
3. **Update message handlers** to support both old and new message types

### Step 4: Validation and Testing

1. **Test dual system operation** - both command and UI systems working
2. **Verify backward compatibility** - existing functionality unchanged
3. **Validate adapter accuracy** - UI representation matches command behavior

## Architecture Benefits

After Phase 1, the codebase will have:

1. **Flexible Foundation**: UINode system supports infinite nesting and complex layouts
2. **Backward Compatibility**: Existing command system continues to work unchanged
3. **Clear Migration Path**: Adapters provide bridge between old and new systems
4. **Type Safety**: Strong TypeScript types prevent runtime errors
5. **Separation of Concerns**: UI structure separated from business logic

## Next Phase Preparation

This phase sets up:
- **Type system** for Phase 2's UIRenderer implementation
- **Adapter pattern** for gradual migration in Phase 3
- **Message infrastructure** for dynamic UI updates in Phase 4

## Potential Issues and Solutions

### Issue: Type Complexity
**Problem**: The new type system is significantly more complex than the current command types.
**Solution**: 
- Start with core types only (UINode, UIAction, UINodeState)
- Add node-specific props incrementally
- Use TypeScript utility types to reduce boilerplate

### Issue: Performance Impact
**Problem**: Adapter conversion adds overhead to command loading.
**Solution**:
- Implement caching in the adapter
- Convert incrementally (only visible commands)
- Profile and optimize hot paths

### Issue: State Synchronization
**Problem**: Keeping command state and UI state in sync during transition period.
**Solution**:
- Use existing command system as source of truth
- Adapter pulls from command state, doesn't modify it
- Clear boundaries between systems

### Issue: Testing Complexity
**Problem**: Two systems to test and maintain during transition.
**Solution**:
- Focus tests on adapter correctness
- Use existing command tests as validation
- Automated comparison between old and new outputs

## Success Criteria

Phase 1 is complete when:

1. ✅ **New type system** compiles without errors
2. ✅ **Adapter converts** existing commands to UI format accurately  
3. ✅ **Background script** can generate UI from command data
4. ✅ **Message handlers** support both command and UI messages
5. ✅ **No regression** in existing command palette functionality
6. ✅ **Foundation established** for Phase 2 UIRenderer implementation

The extension should work exactly as before, but now has the architectural foundation for the new UI system.