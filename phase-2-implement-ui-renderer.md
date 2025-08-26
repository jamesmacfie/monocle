# Phase 2: Implement UIRenderer

## Overview

This phase implements the new UIRenderer system that can render the UINode structures created in Phase 1. The renderer will coexist with the existing CommandPalette, allowing for gradual testing and validation of the new UI system.

## Architectural Relevance

The current system uses CMDK (Command Menu) with hardcoded component structures for rendering commands. The new UIRenderer system provides:

- **Dynamic Component Mapping**: Any UINode type can be rendered by its corresponding React component
- **Recursive Rendering**: Infinite nesting through recursive UINode rendering
- **State Management**: Integrated state handling for interactive elements
- **Search Integration**: Built-in search capabilities that work with the component tree

## End Goals

By the end of Phase 2:

1. **UIRenderer component** that can render any UINode tree
2. **Component library** for all UINode types
3. **State management system** for UI interactions  
4. **Integration hooks** for existing command palette usage
5. **Side-by-side testing** capability with current system

## Key Implementation

### 1. Core UIRenderer Component

#### Main Renderer (`shared/components/UIRenderer.tsx`)

```typescript
import React, { useMemo, useCallback } from 'react';
import type { UINode, UIAction, UINodeState } from '../../types/ui';
import { useUIState } from '../hooks/useUIState';
import { componentMap } from './ui-components';

interface UIRendererProps {
  node: UINode;
  onAction?: (action: UIAction, context: UIContext) => Promise<void>;
  className?: string;
}

export const UIRenderer: React.FC<UIRendererProps> = ({
  node,
  onAction,
  className = ""
}) => {
  const { state, updateNodeState, executeAction } = useUIState();

  // Get the component for this node type
  const Component = useMemo(() => {
    const ComponentClass = componentMap[node.type];
    if (!ComponentClass) {
      console.warn(`No component found for node type: ${node.type}`);
      return componentMap.error; // Fallback to error component
    }
    return ComponentClass;
  }, [node.type]);

  // Handle actions with context
  const handleAction = useCallback(async (action: UIAction) => {
    const context = {
      currentNodeId: node.id,
      navigationPath: [], // TODO: Track navigation path
      focusedNodeId: node.id,
      formValues: {},
      modifierKeys: []
    };

    if (onAction) {
      await onAction(action, context);
    } else {
      await executeAction(action, context);
    }
  }, [node.id, onAction, executeAction]);

  // Handle state updates
  const handleStateUpdate = useCallback((newState: Partial<UINodeState>) => {
    updateNodeState(node.id, newState);
  }, [node.id, updateNodeState]);

  // Get current state for this node
  const currentState = state.nodeStates.get(node.id) || node.state || {};

  // Render child nodes if they exist
  const renderChildren = useCallback(() => {
    if (!node.nodes?.length) return null;
    
    return node.nodes.map(childNode => (
      <UIRenderer
        key={childNode.id}
        node={childNode}
        onAction={onAction}
      />
    ));
  }, [node.nodes, onAction]);

  return (
    <div className={className} data-node-id={node.id} data-node-type={node.type}>
      <Component
        {...node.props}
        id={node.id}
        nodes={node.nodes}
        actions={node.actions}
        state={currentState}
        navigation={node.navigation}
        search={node.search}
        onAction={handleAction}
        onStateUpdate={handleStateUpdate}
        renderChildren={renderChildren}
      />
    </div>
  );
};
```

### 2. UI Component Library

#### Component Map (`shared/components/ui-components/index.ts`)

```typescript
import { ListComponent } from './ListComponent';
import { ListItemComponent } from './ListItemComponent';  
import { ContainerComponent } from './ContainerComponent';
import { TextComponent } from './TextComponent';
import { InputComponent } from './InputComponent';
import { ButtonComponent } from './ButtonComponent';
import { FormComponent } from './FormComponent';
import { StackComponent } from './StackComponent';
import { GridComponent } from './GridComponent';
import { ErrorComponent } from './ErrorComponent';
// ... other components

export const componentMap = {
  container: ContainerComponent,
  list: ListComponent,
  'list-item': ListItemComponent,
  form: FormComponent,
  input: InputComponent,
  textarea: InputComponent, // Can reuse with different props
  select: SelectComponent,
  checkbox: CheckboxComponent,
  radio: RadioComponent,
  button: ButtonComponent,
  text: TextComponent,
  divider: DividerComponent,
  grid: GridComponent,
  stack: StackComponent,
  image: ImageComponent,
  icon: IconComponent,
  progress: ProgressComponent,
  skeleton: SkeletonComponent,
  error: ErrorComponent,
  empty: EmptyComponent
} as const;

export type ComponentType = keyof typeof componentMap;
```

#### Sample Components

**List Component (`shared/components/ui-components/ListComponent.tsx`)**

```typescript
import React from 'react';
import type { ListProps, UIAction, UINodeState, SearchConfig } from '../../../types/ui';
import { useSearch } from '../../hooks/useSearch';

interface ListComponentProps extends ListProps {
  id: string;
  actions?: UIAction[];
  state?: UINodeState;
  search?: SearchConfig;
  onAction?: (action: UIAction) => void;
  renderChildren: () => React.ReactNode;
}

export const ListComponent: React.FC<ListComponentProps> = ({
  searchable = true,
  emptyMessage = "No items",
  id,
  actions,
  state,
  search,
  onAction,
  renderChildren
}) => {
  const {
    searchQuery,
    filteredChildren,
    handleSearchChange,
    showSearch
  } = useSearch({
    nodeId: id,
    searchConfig: search,
    renderChildren
  });

  const children = searchable && searchQuery ? filteredChildren : renderChildren();
  const hasChildren = React.Children.count(children) > 0;

  return (
    <div className="ui-list" data-searchable={searchable}>
      {showSearch && (
        <div className="ui-list-search">
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="ui-search-input"
          />
        </div>
      )}
      
      <div className="ui-list-content">
        {hasChildren ? children : (
          <div className="ui-list-empty">
            {emptyMessage}
          </div>
        )}
      </div>

      {state?.loading?.active && (
        <div className="ui-loading">
          {state.loading.message || "Loading..."}
        </div>
      )}
    </div>
  );
};
```

**Checkbox Component (`shared/components/ui-components/CheckboxComponent.tsx`)**

```typescript
import React from 'react';
import type { CheckboxProps, UIAction, UINodeState } from '../../../types/ui';

interface CheckboxComponentProps extends CheckboxProps {
  id: string;
  state?: UINodeState;
  onStateUpdate?: (newState: Partial<UINodeState>) => void;
}

export const CheckboxComponent: React.FC<CheckboxComponentProps> = ({
  label,
  description,
  defaultValue = false,
  id,
  state,
  onStateUpdate
}) => {
  const currentValue = state?.value !== undefined ? state.value : defaultValue;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onStateUpdate) {
      onStateUpdate({ value: e.target.checked });
    }
  };

  return (
    <div className="ui-checkbox">
      <label className="ui-checkbox-label">
        <input
          type="checkbox"
          checked={currentValue}
          onChange={handleChange}
          disabled={state?.disabled}
          className="ui-checkbox-input"
        />
        <span className="ui-checkbox-text">
          <div className="ui-checkbox-title">{label}</div>
          {description && (
            <div className="ui-checkbox-description">{description}</div>
          )}
        </span>
      </label>
    </div>
  );
};
```

**Settings Form Generator (`shared/components/ui-components/SettingsFormGenerator.tsx`)**

```typescript
import React from 'react';
import type { ComponentSettings, UINode, SettingsSchema } from '../../../types/ui';

interface SettingsFormGeneratorProps {
  settings: ComponentSettings;
  currentValues?: Record<string, any>;
  onSave?: (values: Record<string, any>) => void;
}

export const SettingsFormGenerator: React.FC<SettingsFormGeneratorProps> = ({
  settings,
  currentValues = {},
  onSave
}) => {
  if (!settings.schema) return null;

  const generateFormNode = (schema: SettingsSchema): UINode => {
    return {
      id: `${settings.id}-settings-form`,
      type: 'form',
      search: { searchContext: 'never' },
      nodes: Object.entries(schema.properties).map(([key, definition]) => {
        const nodeId = `setting-${key}`;
        const currentValue = currentValues[key] ?? definition.default;

        switch (definition.type) {
          case 'boolean':
            return {
              id: nodeId,
              type: 'checkbox',
              props: {
                label: definition.title,
                description: definition.description,
                defaultValue: currentValue
              },
              navigatable: true
            };

          case 'select':
            return {
              id: nodeId,
              type: 'select',
              props: {
                label: definition.title,
                options: definition.options || [],
                defaultValue: currentValue
              },
              navigatable: true
            };

          case 'number':
            return {
              id: nodeId,
              type: 'input',
              props: {
                label: definition.title,
                type: 'number',
                defaultValue: String(currentValue)
              },
              navigatable: true
            };

          default:
            return {
              id: nodeId,
              type: 'input',
              props: {
                label: definition.title,
                type: 'text',
                defaultValue: String(currentValue)
              },
              navigatable: true
            };
        }
      }),
      actions: [{
        id: 'save-settings',
        label: 'Save Settings',
        type: 'primary',
        handler: {
          type: 'action',
          actionId: 'save-component-settings',
          params: { componentId: settings.id }
        }
      }]
    };
  };

  const formNode = generateFormNode(settings.schema);
  
  return (
    <div className="ui-settings-form">
      {/* This would render using the UIRenderer */}
      <h3>Settings for {settings.id}</h3>
      {/* Form nodes would be rendered here */}
    </div>
  );
};
```

**List Item Component (`shared/components/ui-components/ListItemComponent.tsx`)**

```typescript
import React from 'react';
import type { ListItemProps, UIAction, UINodeState } from '../../../types/ui';
import { Icon } from '../icon';

interface ListItemComponentProps extends ListItemProps {
  id: string;
  actions?: UIAction[];
  state?: UINodeState;
  onAction?: (action: UIAction) => void;
  renderChildren: () => React.ReactNode;
}

export const ListItemComponent: React.FC<ListItemComponentProps> = ({
  label,
  description,
  icon,
  color,
  badges,
  accessory,
  keywords,
  id,
  actions,
  state,
  onAction,
  renderChildren
}) => {
  const handleClick = () => {
    const primaryAction = actions?.find(a => a.type === "primary");
    if (primaryAction && onAction) {
      onAction(primaryAction);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleClick();
    }
    
    // Handle modifier actions
    if (e.key === "Alt" && actions?.length) {
      // Trigger actions menu
      e.preventDefault();
    }
  };

  return (
    <div 
      className={`ui-list-item ${state?.focused ? 'focused' : ''} ${state?.selected ? 'selected' : ''}`}
      data-color={color}
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <div className="ui-list-item-content">
        {icon && (
          <div className="ui-list-item-icon">
            <Icon {...icon} />
          </div>
        )}
        
        <div className="ui-list-item-text">
          <div className="ui-list-item-label">
            {label}
          </div>
          {description && (
            <div className="ui-list-item-description">
              {description}
            </div>
          )}
        </div>

        {badges && badges.length > 0 && (
          <div className="ui-list-item-badges">
            {badges.map((badge, index) => (
              <span 
                key={index}
                className={`ui-badge ui-badge-${badge.variant || 'solid'}`}
                data-color={badge.color}
              >
                {badge.text}
              </span>
            ))}
          </div>
        )}

        {accessory && (
          <div className="ui-list-item-accessory">
            {/* Render accessory UINode */}
          </div>
        )}
      </div>

      {/* Render children if action is selected */}
      <div className="ui-list-item-children">
        {renderChildren()}
      </div>

      {state?.loading?.active && (
        <div className="ui-list-item-loading">
          {state.loading.showSkeleton ? (
            <div className="ui-skeleton" />
          ) : (
            <div className="ui-spinner" />
          )}
        </div>
      )}
    </div>
  );
};
```

### 3. State Management System

#### UI State Hook (`shared/hooks/useUIState.tsx`)

```typescript
import { useReducer, useCallback } from 'react';
import type { UINode, UIAction, UINodeState, UIContext } from '../../types/ui';
import { useSendMessage } from './useSendMessage';

interface UIState {
  rootNode?: UINode;
  nodeStates: Map<string, UINodeState>;
  navigationStack: NavigationFrame[];
  focusedNodeId?: string;
  loading: boolean;
  error?: string;
}

interface NavigationFrame {
  nodeId: string;
  actionId?: string;
  scrollPosition?: number;
}

type UIStateAction = 
  | { type: 'SET_ROOT_NODE'; node: UINode }
  | { type: 'UPDATE_NODE_STATE'; nodeId: string; state: Partial<UINodeState> }
  | { type: 'SET_FOCUSED_NODE'; nodeId: string }
  | { type: 'PUSH_NAVIGATION'; frame: NavigationFrame }
  | { type: 'POP_NAVIGATION' }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'SET_ERROR'; error: string };

const initialState: UIState = {
  nodeStates: new Map(),
  navigationStack: [],
  loading: false
};

function uiStateReducer(state: UIState, action: UIStateAction): UIState {
  switch (action.type) {
    case 'SET_ROOT_NODE':
      return { ...state, rootNode: action.node };
      
    case 'UPDATE_NODE_STATE':
      const newStates = new Map(state.nodeStates);
      const currentState = newStates.get(action.nodeId) || {};
      newStates.set(action.nodeId, { ...currentState, ...action.state });
      return { ...state, nodeStates: newStates };
      
    case 'SET_FOCUSED_NODE':
      return { ...state, focusedNodeId: action.nodeId };
      
    case 'PUSH_NAVIGATION':
      return { 
        ...state, 
        navigationStack: [...state.navigationStack, action.frame] 
      };
      
    case 'POP_NAVIGATION':
      return { 
        ...state, 
        navigationStack: state.navigationStack.slice(0, -1) 
      };
      
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
      
    case 'SET_ERROR':
      return { ...state, error: action.error };
      
    default:
      return state;
  }
}

export const useUIState = () => {
  const [state, dispatch] = useReducer(uiStateReducer, initialState);
  const sendMessage = useSendMessage();

  const updateNodeState = useCallback((nodeId: string, newState: Partial<UINodeState>) => {
    dispatch({ type: 'UPDATE_NODE_STATE', nodeId, state: newState });
  }, []);

  const executeAction = useCallback(async (action: UIAction, context: UIContext) => {
    try {
      dispatch({ type: 'SET_LOADING', loading: true });
      
      const response = await sendMessage({
        type: 'ui-action',
        action: action.handler,
        context,
        nodeStates: Object.fromEntries(state.nodeStates)
      });

      if (response.type === 'ui-error') {
        dispatch({ type: 'SET_ERROR', error: response.error.error.message });
      }

      // Handle navigation if action has children
      if (action.children) {
        dispatch({ 
          type: 'PUSH_NAVIGATION', 
          frame: { nodeId: context.currentNodeId, actionId: action.id } 
        });
      }

    } catch (error) {
      dispatch({ type: 'SET_ERROR', error: error.message });
    } finally {
      dispatch({ type: 'SET_LOADING', loading: false });
    }
  }, [sendMessage, state.nodeStates]);

  const navigateBack = useCallback(() => {
    dispatch({ type: 'POP_NAVIGATION' });
  }, []);

  return {
    state,
    updateNodeState,
    executeAction,
    navigateBack,
    setRootNode: (node: UINode) => dispatch({ type: 'SET_ROOT_NODE', node }),
    setFocusedNode: (nodeId: string) => dispatch({ type: 'SET_FOCUSED_NODE', nodeId })
  };
};
```

### 4. Integration with Existing System

#### Enhanced CommandPaletteUI (`shared/components/CommandPaletteUI.tsx`)

```typescript
import * as React from "react";
const { useEffect, useCallback, useState } = React;
import { CommandPalette } from "./command";
import { UIRenderer } from "./UIRenderer";
import { useGetCommands } from "../hooks/useGetCommands";
import { useSendMessage } from "../hooks/useSendMessage";
import { useGlobalKeybindings } from "../../content/hooks/useGlobalKeybindings";
import { CommandToUIAdapter } from "../../adapters/commandToUI";

interface CommandPaletteUIProps {
  isAlwaysVisible?: boolean;
  onClose?: () => void;
  className?: string;
  autoFocus?: boolean;
  useNewRenderer?: boolean; // Feature flag for testing
}

export const CommandPaletteUI: React.FC<CommandPaletteUIProps> = ({
  isAlwaysVisible = false,
  onClose,
  className = "",
  autoFocus = false,
  useNewRenderer = false // Default to false for backward compatibility
}) => {
  const { data, isLoading, fetchCommands } = useGetCommands();
  const sendMessage = useSendMessage();
  const [uiRoot, setUIRoot] = useState<UINode | null>(null);

  // Enable global keybindings
  useGlobalKeybindings();

  // Convert command data to UI format when using new renderer
  useEffect(() => {
    if (useNewRenderer && data && !isLoading) {
      CommandToUIAdapter.convertCommandData(data)
        .then(setUIRoot)
        .catch(console.error);
    }
  }, [useNewRenderer, data, isLoading]);

  // Fetch commands on initial render
  useEffect(() => {
    fetchCommands();
  }, []);

  // Handle UI actions from new renderer
  const handleUIAction = useCallback(async (action: UIAction, context: UIContext) => {
    try {
      const response = await sendMessage({
        type: "ui-action",
        action: action.handler,
        context
      });

      if (response.success) {
        if (!isAlwaysVisible && onClose) {
          onClose();
        }
      }
    } catch (error) {
      console.error("[CommandPaletteUI] Error executing UI action:", error);
    }
  }, [isAlwaysVisible, onClose, sendMessage]);

  // Legacy command execution
  const executeCommand = useCallback(
    async (
      id: string,
      formValues: Record<string, string>,
      navigateBack: boolean = true
    ) => {
      try {
        const response = await sendMessage({
          type: "execute-command",
          id,
          formValues,
        });

        if (response.success && navigateBack) {
          if (!isAlwaysVisible && onClose) {
            onClose();
          }
        }
      } catch (error) {
        console.error("[CommandPaletteUI] Error sending execute message:", error);
      }
    },
    [isAlwaysVisible, onClose, sendMessage]
  );

  const handleClose = useCallback(() => {
    if (!isAlwaysVisible && onClose) {
      onClose();
    }
  }, [isAlwaysVisible, onClose]);

  // Render new UI system or fall back to legacy
  if (useNewRenderer && uiRoot) {
    return (
      <div className={className}>
        <UIRenderer 
          node={uiRoot}
          onAction={handleUIAction}
        />
      </div>
    );
  }

  // Legacy renderer
  return (
    <div className={className}>
      <CommandPalette
        items={data}
        executeCommand={executeCommand}
        close={handleClose}
        onRefreshCommands={fetchCommands}
        autoFocus={autoFocus}
      />
    </div>
  );
};
```

## Implementation Steps

### Step 1: Create UIRenderer Infrastructure
1. **Implement core UIRenderer component** with recursive rendering
2. **Create component map** and base component interfaces  
3. **Set up state management** with useUIState hook

### Step 2: Build Component Library
1. **Implement essential components**: List, ListItem, Container, Text, Input, Button
2. **Add form components**: Form, Select, Checkbox, Radio
3. **Create utility components**: Stack, Grid, Skeleton, Error
4. **Add settings components**: Settings form generator, settings UI components

### Step 3: Integration and Testing
1. **Add feature flag** to CommandPaletteUI for testing new renderer
2. **Test side-by-side** with existing command palette
3. **Validate functionality** matches existing behavior

### Step 4: Polish and Optimize
1. **Add proper styling** to match existing design
2. **Optimize performance** with memoization and virtual scrolling
3. **Handle edge cases** and error states

## Architecture Benefits

The UIRenderer system provides:

1. **Infinite Flexibility**: Any UI structure can be expressed as UINodes
2. **Type Safety**: Full TypeScript support for all component props
3. **Consistent Behavior**: Search, navigation, and state management work uniformly
4. **Performance**: Optimized rendering with React best practices
5. **Extensibility**: Easy to add new component types and behaviors

## Success Criteria

Phase 2 is complete when:

1. ✅ **UIRenderer renders** basic UINode structures correctly
2. ✅ **Component library** supports all essential UI types
3. ✅ **State management** handles user interactions properly
4. ✅ **Feature flag** allows switching between old and new renderers
5. ✅ **Functionality parity** with existing command palette
6. ✅ **No performance regression** compared to current system

The extension should work identically with both renderers, proving the new system is ready for broader adoption in Phase 3.