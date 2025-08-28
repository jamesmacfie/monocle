import * as icons from "lucide-react";

type ModifierKey = "shift" | "cmd" | "alt" | "ctrl";
export interface ExecutionContext {
  url: string;
  title: string;
  modifierKey: ModifierKey | null;
}

export type SupportedBrowser = "chrome" | "firefox";

export type ColorName =
  | "red"
  | "green"
  | "blue"
  | "amber"
  | "lightBlue"
  | "gray"
  | "purple"
  | "orange"
  | "teal"
  | "pink"
  | "indigo"
  | "yellow";

export type Icon = {
  name?: keyof typeof icons;
  url?: string;
};

type valueOrAsyncExecution<T> = T | ((context: ExecutionContext) => Promise<T>);

export type BaseCommand = {
  id: string;
  name: valueOrAsyncExecution<string | string[]>;
  description?: valueOrAsyncExecution<string>;
  color?: valueOrAsyncExecution<ColorName | string>;
  keywords?: valueOrAsyncExecution<string[]>;
  icon?: valueOrAsyncExecution<Icon>;
  priority?: (context: ExecutionContext) => Promise<Command[]>;
  supportedBrowsers?: SupportedBrowser[];
  actions?: Command[];
  keybinding?: string;
  doNotAddToRecents?: boolean;
};

export type ActionLabel = {
  actionLabel?: valueOrAsyncExecution<string>;
  modifierActionLabel?: {
    [modifierKey in ModifierKey]?: valueOrAsyncExecution<string>;
  };
};

export type RunCommand = BaseCommand &
  ActionLabel & {
    run: (
      context?: ExecutionContext,
      values?: Record<string, string>,
    ) => void | Promise<void>;
  };

export type ParentCommand = BaseCommand & {
  commands: (context: ExecutionContext) => Promise<Command[]>;
};

export type UICommand = BaseCommand &
  ActionLabel & {
    ui: CommandUI[];
    run: (
      context?: ExecutionContext,
      values?: Record<string, string>,
    ) => void | Promise<void>;
  };

export type Command = RunCommand | ParentCommand | UICommand;

export type CommandUIInput = {
  id: string;
  type: "input";
  label?: string;
  placeholder?: string;
  defaultValue?: string;
};

export type CommandUIText = {
  id: string;
  type: "text";
  label?: string;
};

export type CommandUI = CommandUIInput | CommandUIText;

export type CommandSuggestionUI = CommandUIInput | CommandUIText;

export type CommandSuggestion = {
  id: string;
  name: string | string[];
  description?: string;
  color?: string;
  keywords?: string[];
  hasCommands: boolean;
  icon?: Icon;
  ui?: CommandSuggestionUI[];
  actionLabel: string;
  modifierActionLabel?: {
    [modifierKey in ModifierKey]?: string;
  };
  actions?: CommandSuggestion[];
  keybinding?: string;
  isFavorite?: boolean;
};

export type ExecuteCommandMessage = {
  type: "execute-command";
  id: string;
  context: ExecutionContext;
  formValues?: Record<string, string>;
};

export type ExecuteKeybindingMessage = {
  type: "execute-keybinding";
  keybinding: string;
  context: ExecutionContext;
};

export type GetChildrenMessage = {
  type: "get-children-commands";
  id: string;
  context: ExecutionContext;
};

export type GetCommandsMessage = {
  type: "get-commands";
  context: ExecutionContext;
};

export type Message = ExecuteCommandMessage | GetChildrenMessage | GetCommandsMessage | ExecuteKeybindingMessage;

export type AlertEvent = {
  type: "monocle-alert";
  level: "info" | "warning" | "success" | "error";
  message: string;
  icon?: Icon;
  copyText?: string;
};

export type CopyToClipboardEvent = {
  type: "monocle-copyToClipboard";
  message: string;
};

export type NewTabEvent = {
  type: "monocle-newTab";
  url: string;
};

export type Event = AlertEvent | CopyToClipboardEvent | NewTabEvent;
