# Phase 3: Convert Commands to UI Generators

## Overview

This phase migrates existing commands from the command-centric model to the new UI-centric architecture. Instead of commands containing business logic, they become UI generators that create rich, interactive UINode structures. The background script becomes the primary coordinator of all operations.

## Architectural Shift

**From**: Commands execute browser operations directly
**To**: Commands generate UI descriptions, background script handles all operations

This shift enables:
- **Richer UIs**: Complex forms, multi-step wizards, progress indicators
- **Better Error Handling**: UI-based error states with retry actions
- **Dynamic Updates**: Real-time progress updates for long-running operations
- **Consistent Interactions**: All UI behavior follows the same patterns

## End Goals

By the end of Phase 3:

1. **Core commands converted** to UI generators with enhanced capabilities
2. **UI-first command creation pattern** established for future commands
3. **Advanced UI patterns** implemented (forms, progress, async operations)
4. **Backward compatibility maintained** during gradual migration
5. **Performance optimized** for complex UI structures

## Key Migration Patterns

### 1. Simple Command → List Item with Actions

**Before** (`closeCurrentTab` command):
```typescript
export const closeCurrentTab: RunCommand = {
  id: "close-current-tab",
  name: "Close Current Tab",
  icon: { name: "X" },
  run: async () => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      await chrome.tabs.remove(tabs[0].id!);
    }
  }
};
```

**After** (UI Generator):
```typescript
export const closeCurrentTabUI = async (): Promise<ListItemNode> => {
  return {
    id: "close-current-tab",
    type: "list-item",
    props: {
      label: "Close Current Tab",
      description: "Close the currently active tab",
      icon: { name: "X" },
      color: "red",
      keywords: ["close", "tab", "current", "active"]
    },
    navigatable: true,
    settings: {
      id: "tab-operations",
      schema: {
        properties: {
          confirmBeforeClosing: {
            type: "boolean",
            title: "Confirm Before Closing",
            description: "Show confirmation dialog before closing tabs",
            default: false
          }
        }
      }
    },
    actions: [
      {
        id: "close-tab-action",
        label: "Close Tab",
        type: "primary",
        keybinding: "↵",
        handler: {
          type: "action",
          actionId: "close-current-tab",
          params: {}
        }
      },
      {
        id: "close-tab-confirm",
        label: "Close with Confirmation",
        type: "secondary",
        handler: {
          type: "action",
          actionId: "close-current-tab-with-confirmation",
          params: {}
        }
      }
    ]
  };
};
```

**Background Handler**:
```typescript
// background/actions/tabs.ts
export const closeCurrentTab = async (params: any): Promise<UIResponse> => {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]) {
      await chrome.tabs.remove(tabs[0].id!);
      return { type: "ui-update", updates: [] }; // Success, no UI updates needed
    } else {
      throw new Error("No active tab found");
    }
  } catch (error) {
    return {
      type: "ui-error",
      error: {
        nodeId: "close-current-tab",
        error: {
          message: "Failed to close tab",
          details: error.message,
          recoverable: false
        }
      }
    };
  }
};
```

### 2. UI Command → Interactive Form

**Before** (`googleSearch` with basic input):
```typescript
export const googleSearch: UICommand = {
  id: "google-search",
  name: "Google Search",
  ui: [{ id: "query", type: "input", placeholder: "Search query..." }],
  run: async (context, values) => {
    const url = `https://google.com/search?q=${encodeURIComponent(values.query)}`;
    await chrome.tabs.create({ url });
  }
};
```

**After** (Rich Form UI):
```typescript
export const googleSearchUI = async (): Promise<UINode> => {
  return {
    id: "google-search-form",
    type: "form",
    search: { searchContext: "never" },
    navigation: { tabOrder: ["search-query", "safe-search", "new-tab", "submit"] },
    nodes: [
      {
        id: "search-header",
        type: "text",
        props: {
          content: "# Google Search\nSearch the web with Google"
        }
      },
      {
        id: "search-query",
        type: "input",
        props: {
          label: "Search Query",
          placeholder: "What are you looking for?",
          type: "text",
          required: true,
          autoFocus: true
        },
        navigatable: true
      },
      {
        id: "search-options",
        type: "stack",
        props: { direction: "vertical", spacing: "small" },
        nodes: [
          {
            id: "safe-search",
            type: "checkbox",
            props: { label: "Safe Search" },
            state: { value: true }
          },
          {
            id: "new-tab",
            type: "checkbox", 
            props: { label: "Open in New Tab" },
            state: { value: true }
          }
        ]
      },
      {
        id: "submit",
        type: "button",
        props: {
          label: "Search",
          variant: "primary",
          icon: { name: "Search" }
        },
        actions: [
          {
            id: "execute-search",
            label: "Search",
            type: "primary",
            keybinding: "↵",
            handler: {
              type: "submit-form",
              formId: "google-search-form"
            }
          }
        ]
      }
    ]
  };
};
```

**Enhanced Background Handler**:
```typescript
export const executeGoogleSearch = async (formValues: Record<string, any>): Promise<UIResponse> => {
  const { query, safeSearch, newTab } = formValues;
  
  if (!query?.trim()) {
    return {
      type: "ui-error",
      error: {
        nodeId: "search-query",
        error: {
          message: "Search query is required",
          details: "Please enter a search term",
          recoverable: true
        }
      }
    };
  }

  try {
    let searchUrl = `https://google.com/search?q=${encodeURIComponent(query)}`;
    if (safeSearch) {
      searchUrl += "&safe=active";
    }

    if (newTab) {
      await chrome.tabs.create({ url: searchUrl });
    } else {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs[0]) {
        await chrome.tabs.update(tabs[0].id, { url: searchUrl });
      }
    }

    return { type: "ui-update", updates: [] };
  } catch (error) {
    return {
      type: "ui-error", 
      error: {
        nodeId: "google-search-form",
        error: {
          message: "Search failed",
          details: error.message,
          recoverable: true,
          retryAction: {
            id: "retry-search",
            label: "Try Again",
            type: "primary",
            handler: { type: "submit-form", formId: "google-search-form" }
          }
        }
      }
    };
  }
};
```

### 3. Parent Command → Dynamic UI Generation

**Before** (`gotoTab` with child commands):
```typescript
export const gotoTab: ParentCommand = {
  id: "goto-tab",
  name: "Go to Tab",
  commands: async () => {
    const tabs = await chrome.tabs.query({});
    return tabs.map(tab => ({
      id: `goto-tab-${tab.id}`,
      name: tab.title || "Untitled",
      run: () => chrome.tabs.update(tab.id, { active: true })
    }));
  }
};
```

**After** (Dynamic List with Rich Items):
```typescript
export const gotoTabUI = async (): Promise<UINode> => {
  const tabs = await chrome.tabs.query({});
  
  return {
    id: "goto-tab-list",
    type: "list", 
    props: {
      searchable: true,
      emptyMessage: "No open tabs found"
    },
    search: {
      searchContext: "always",
      searchTargets: [
        { field: "label", weight: 10 },
        { field: "description", weight: 5 },
        { field: "keywords", weight: 3 }
      ]
    },
    nodes: await Promise.all(tabs.map(async (tab) => {
      const isActive = tab.active;
      const domain = tab.url ? new URL(tab.url).hostname : '';
      
      return {
        id: `tab-${tab.id}`,
        type: "list-item",
        props: {
          label: tab.title || "Untitled Tab",
          description: tab.url || "No URL",
          icon: tab.favIconUrl ? { url: tab.favIconUrl } : { name: "Globe" },
          color: isActive ? "blue" : "gray",
          badges: [
            ...(isActive ? [{ text: "Active", color: "blue" as const }] : []),
            ...(tab.pinned ? [{ text: "📌", color: "yellow" as const }] : [])
          ],
          keywords: [
            tab.title?.toLowerCase() || "",
            domain,
            isActive ? "active" : "inactive",
            tab.pinned ? "pinned" : ""
          ].filter(Boolean),
          accessory: {
            id: `tab-${tab.id}-status`,
            type: "text",
            props: { content: isActive ? "●" : "○" }
          }
        },
        navigatable: true,
        actions: [
          {
            id: `switch-to-tab-${tab.id}`,
            label: "Switch to Tab",
            type: "primary",
            keybinding: "↵",
            handler: {
              type: "action",
              actionId: "switch-to-tab",
              params: { tabId: tab.id }
            }
          },
          {
            id: `close-tab-${tab.id}`,
            label: "Close Tab",
            type: "secondary",
            keybinding: "⌘ ⌫",
            handler: {
              type: "action",
              actionId: "close-tab",
              params: { tabId: tab.id }
            }
          },
          {
            id: `pin-tab-${tab.id}`,
            label: tab.pinned ? "Unpin Tab" : "Pin Tab",
            type: "secondary",
            handler: {
              type: "action",
              actionId: "toggle-pin-tab",
              params: { tabId: tab.id, pinned: !tab.pinned }
            }
          }
        ]
      } as ListItemNode;
    }))
  };
};
```

## Advanced UI Patterns

### 1. Multi-Step Wizard

```typescript
export const newTabWizardUI = async (step: number = 1): Promise<UINode> => {
  const steps = [
    { id: "url", title: "Enter URL", icon: "Link" },
    { id: "options", title: "Tab Options", icon: "Settings" },
    { id: "confirm", title: "Confirm", icon: "Check" }
  ];

  const currentStep = steps[step - 1];
  
  return {
    id: "new-tab-wizard",
    type: "container",
    props: {
      title: `New Tab - ${currentStep.title} (${step} of ${steps.length})`,
      padding: true
    },
    nodes: [
      // Progress indicator
      {
        id: "wizard-progress",
        type: "stack",
        props: { direction: "horizontal", spacing: "small" },
        nodes: steps.map((s, index) => ({
          id: `step-${index + 1}`,
          type: "text",
          props: {
            content: index + 1 === step 
              ? `**${index + 1}. ${s.title}**` 
              : index + 1 < step 
                ? `~~${index + 1}. ${s.title}~~` 
                : `${index + 1}. ${s.title}`
          }
        }))
      },
      
      // Step content
      ...(await getWizardStepContent(step)),
      
      // Navigation buttons
      {
        id: "wizard-nav",
        type: "stack",
        props: { direction: "horizontal", spacing: "medium", align: "end" },
        nodes: [
          ...(step > 1 ? [{
            id: "back-btn",
            type: "button" as const,
            props: { label: "Back", variant: "secondary" as const },
            actions: [{
              id: "wizard-back",
              label: "Back",
              type: "primary" as const,
              handler: { 
                type: "action" as const, 
                actionId: "wizard-navigate",
                params: { step: step - 1 }
              }
            }]
          }] : []),
          {
            id: "next-btn",
            type: "button" as const,
            props: { 
              label: step === steps.length ? "Create Tab" : "Next", 
              variant: "primary" as const 
            },
            actions: [{
              id: "wizard-next",
              label: step === steps.length ? "Create" : "Next",
              type: "primary" as const,
              handler: {
                type: "action" as const,
                actionId: step === steps.length ? "create-tab" : "wizard-navigate",
                params: { step: step === steps.length ? undefined : step + 1 }
              }
            }]
          }
        ]
      }
    ]
  };
};

async function getWizardStepContent(step: number): Promise<UINode[]> {
  switch (step) {
    case 1:
      return [{
        id: "url-input",
        type: "input",
        props: {
          label: "Tab URL",
          placeholder: "https://example.com",
          type: "url",
          autoFocus: true
        }
      }];
      
    case 2:
      return [
        {
          id: "tab-options",
          type: "stack",
          props: { direction: "vertical", spacing: "medium" },
          nodes: [
            {
              id: "active-option",
              type: "checkbox",
              props: { label: "Make tab active" },
              state: { value: true }
            },
            {
              id: "pinned-option", 
              type: "checkbox",
              props: { label: "Pin tab" }
            },
            {
              id: "window-select",
              type: "select",
              props: {
                label: "Target Window",
                options: [
                  { value: "current", label: "Current Window" },
                  { value: "new", label: "New Window" }
                ],
                defaultValue: "current"
              }
            }
          ]
        }
      ];
      
    case 3:
      // Show summary for confirmation
      return [{
        id: "confirmation",
        type: "text",
        props: {
          content: "**Tab Summary:**\n\n• URL: [URL from step 1]\n• Active: [Yes/No]\n• Pinned: [Yes/No]\n• Window: [Current/New]"
        }
      }];
      
    default:
      return [];
  }
}
```

### 2. Long-Running Operations with Progress

```typescript
export const bulkTabOperationUI = async (): Promise<UINode> => {
  return {
    id: "bulk-tab-operation",
    type: "container",
    props: { title: "Bulk Tab Operations", padding: true },
    nodes: [
      {
        id: "operation-select",
        type: "select",
        props: {
          label: "Operation",
          options: [
            { value: "close-duplicates", label: "Close Duplicate Tabs" },
            { value: "reload-all", label: "Reload All Tabs" },
            { value: "bookmark-all", label: "Bookmark All Tabs" }
          ]
        }
      },
      {
        id: "target-select", 
        type: "select",
        props: {
          label: "Target",
          options: [
            { value: "current-window", label: "Current Window Only" },
            { value: "all-windows", label: "All Windows" }
          ],
          defaultValue: "current-window"
        }
      },
      {
        id: "execute-btn",
        type: "button",
        props: { label: "Execute", variant: "primary" },
        actions: [{
          id: "start-bulk-operation",
          label: "Execute",
          type: "primary",
          handler: {
            type: "action",
            actionId: "start-bulk-tab-operation",
            params: {}
          }
        }]
      }
    ]
  };
};

// Background handler creates progress UI
export const startBulkTabOperation = async (params: any): Promise<UIResponse> => {
  const { operation, target } = params;
  
  // Replace form with progress UI
  const progressUI: UINode = {
    id: "bulk-operation-progress",
    type: "container",
    props: { title: "Processing Tabs", padding: true },
    nodes: [
      {
        id: "operation-progress",
        type: "progress",
        props: {
          value: 0,
          label: "Starting operation...",
          showPercentage: true,
          variant: "default"
        },
        state: {
          loading: { active: true, message: "Operation in progress" }
        },
        actions: [{
          id: "cancel-operation",
          label: "Cancel",
          type: "secondary",
          handler: { 
            type: "action", 
            actionId: "cancel-bulk-operation",
            params: { operationId: "bulk-op-123" }
          }
        }]
      },
      {
        id: "operation-log",
        type: "text",
        props: { content: "_Operation log will appear here..._" }
      }
    ]
  };

  // Start background task
  backgroundTaskManager.startBulkTabOperation(operation, target, "bulk-op-123");
  
  return {
    type: "ui-update",
    updates: [{
      type: "replace",
      nodeId: "bulk-tab-operation",
      node: progressUI
    }]
  };
};
```

## Command Migration Strategy

### Step 1: Identify Command Categories

**Simple Commands** (execute once, no UI needed):
- `closeCurrentTab`, `openNewWindow`, `refreshCurrentTab`
- Convert to ListItem with single action
- Background handler executes browser operation

**Form Commands** (require user input):
- `googleSearch`, `openUrl`, `createBookmark`  
- Convert to rich Form UI with validation
- Enhanced error handling and user feedback

**List Commands** (show dynamic data):
- `gotoTab`, `switchWindow`, `openBookmark`
- Convert to searchable List with rich items
- Real-time data updates and filtering

**Complex Commands** (multi-step workflows):
- `moveTabToWindow`, `bulkTabOperations`
- Convert to wizard or progressive UI
- Progress tracking for long operations

### Step 2: Create UI Generator Functions

For each command category, create standardized generators:

```typescript
// generators/simpleCommand.ts
export const createSimpleCommandUI = (config: {
  id: string;
  label: string;
  description?: string;
  icon?: Icon;
  color?: ColorName;
  actionId: string;
  confirmationRequired?: boolean;
}): ListItemNode => {
  const { id, label, description, icon, color, actionId, confirmationRequired } = config;
  
  const actions: UIAction[] = [{
    id: `${id}-action`,
    label,
    type: "primary",
    handler: { type: "action", actionId, params: {} }
  }];

  if (confirmationRequired) {
    actions.push({
      id: `${id}-confirm`,
      label: `${label} (Confirm)`,
      type: "secondary", 
      handler: {
        type: "action",
        actionId: `${actionId}-with-confirmation`,
        params: {}
      }
    });
  }

  return {
    id,
    type: "list-item",
    props: { label, description, icon, color },
    navigatable: true,
    actions
  };
};

// generators/formCommand.ts
export const createFormCommandUI = (config: {
  id: string;
  title: string;
  description?: string;
  fields: FormFieldConfig[];
  submitLabel?: string;
  submitActionId: string;
}): UINode => {
  // Generate form UI based on field configuration
  return {
    id: config.id,
    type: "form",
    // ... implementation
  };
};
```

### Step 3: Update Background Message Handler

Extend the message handler to route UI actions to appropriate handlers:

```typescript
// background/actions/index.ts
const actionHandlers = {
  // Tab operations
  "close-current-tab": closeCurrentTab,
  "switch-to-tab": switchToTab,
  "close-tab": closeTab,
  "toggle-pin-tab": togglePinTab,
  
  // Search operations  
  "google-search": executeGoogleSearch,
  "bing-search": executeBingSearch,
  
  // Bulk operations
  "start-bulk-tab-operation": startBulkTabOperation,
  "cancel-bulk-operation": cancelBulkOperation,
  
  // Wizard navigation
  "wizard-navigate": navigateWizard,
  
  // Form submissions
  "submit-form": handleFormSubmission,
  
  // Settings operations
  "show-component-settings": showComponentSettings,
  "save-component-settings": saveComponentSettings,
  "reset-component-settings": resetComponentSettings
};

export const handleUIAction = async (action: ActionHandler, context: UIContext): Promise<UIResponse> => {
  const handler = actionHandlers[action.actionId];
  
  if (!handler) {
    return {
      type: "ui-error",
      error: {
        nodeId: context.currentNodeId,
        error: {
          message: "Unknown action",
          details: `Action ${action.actionId} is not implemented`,
          recoverable: false
        }
      }
    };
  }

  try {
    return await handler(action.params || {}, context);
  } catch (error) {
    return {
      type: "ui-error",
      error: {
        nodeId: context.currentNodeId,
        error: {
          message: "Action failed",
          details: error.message,
          recoverable: true
        }
      }
    };
  }
};

// Settings action handlers
export const showComponentSettings = async (params: { componentId: string }): Promise<UIResponse> => {
  const { componentId } = params;
  
  try {
    // Get component settings schema and current values
    const settings = await getComponentSettings(componentId);
    const schema = getComponentSettingsSchema(componentId);
    
    if (!schema) {
      return {
        type: "ui-error",
        error: {
          nodeId: componentId,
          error: {
            message: "Settings not available",
            details: `Component ${componentId} does not have configurable settings`,
            recoverable: false
          }
        }
      };
    }
    
    // Generate settings form UI
    const settingsForm = generateSettingsFormUI(componentId, schema, settings);
    
    return {
      type: "ui-navigate",
      navigation: {
        targetNodeId: settingsForm.id,
        action: "push"
      }
    };
  } catch (error) {
    return {
      type: "ui-error",
      error: {
        nodeId: componentId,
        error: {
          message: "Failed to load settings",
          details: error.message,
          recoverable: true
        }
      }
    };
  }
};

export const saveComponentSettings = async (params: { componentId: string }, context: UIContext): Promise<UIResponse> => {
  const { componentId } = params;
  
  try {
    // Extract form values from context
    const formValues = context.formValues || {};
    
    // Save settings
    await setComponentSettings(componentId, formValues);
    
    return {
      type: "ui-update",
      updates: [{
        type: "replace",
        nodeId: `${componentId}-settings-form`,
        node: {
          id: "settings-saved",
          type: "container",
          nodes: [{
            id: "success-message",
            type: "text",
            props: { content: "✅ Settings saved successfully!" }
          }]
        }
      }]
    };
  } catch (error) {
    return {
      type: "ui-error",
      error: {
        nodeId: componentId,
        error: {
          message: "Failed to save settings",
          details: error.message,
          recoverable: true
        }
      }
    };
  }
};
```

## Implementation Steps

### Step 1: Convert Core Commands
1. **Start with simple commands** (close tab, refresh, new window)
2. **Create generators** for each command type
3. **Test conversions** maintain functionality

### Step 2: Enhanced Form Commands
1. **Upgrade search commands** with rich forms
2. **Add validation** and better error handling
3. **Implement progress indicators** for long operations

### Step 3: Settings System Implementation
1. **Add component settings** to UI generators
2. **Implement settings action handlers** (show, save, reset)
3. **Create settings form generator** utility
4. **Add global settings UI** for system preferences

### Step 4: Complex UI Patterns
1. **Build wizard components** for multi-step workflows
2. **Add progress tracking** for bulk operations  
3. **Implement real-time updates** for dynamic data

### Step 5: Polish and Optimize  
1. **Add smooth transitions** between UI states
2. **Optimize performance** for large lists
3. **Add keyboard shortcuts** for power users

## Success Criteria

Phase 3 is complete when:

1. ✅ **Core commands migrated** to UI generators successfully
2. ✅ **Advanced UI patterns** working (forms, wizards, progress)
3. ✅ **Settings system implemented** with component and global settings
4. ✅ **Background handlers** manage all browser operations
5. ✅ **Performance maintained** with complex UI structures
6. ✅ **User experience enhanced** with richer interactions
7. ✅ **Migration path established** for remaining commands

The command palette should now offer significantly richer interactions while maintaining the keyboard-first experience users expect.