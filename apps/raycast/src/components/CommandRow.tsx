import {
  Action,
  ActionPanel,
  Clipboard,
  List,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { iconFor } from "../lib/icons";
import { runCommand } from "../lib/execute";
import type { ExternalSuggestion } from "../lib/types";
import { CommandList } from "./CommandList";

function accessoriesFor(s: ExternalSuggestion): List.Item.Accessory[] {
  const acc: List.Item.Accessory[] = [];
  if (s.requiresPermission && s.requiresPermission.length > 0) {
    acc.push({
      icon: "🔐",
      tooltip: `May prompt for: ${s.requiresPermission.join(", ")}`,
    });
  }
  if (s.type === "group" || s.type === "search") {
    acc.push({ text: s.type });
  }
  return acc;
}

async function notRunnable() {
  await showToast({
    style: Toast.Style.Failure,
    title:
      "Enable “Allow command execution” in Monocle settings to run commands from Raycast",
  });
}

/**
 * One List.Item, with the action panel routed by `s.type`:
 *   group/search → push a nested CommandList
 *   action/submit → run via the bridge (gated by executionEnabled)
 *   calculation → copy the result title
 *   display → informational, no primary action
 */
export function CommandRow({
  s,
  parentPath,
  target,
  executionEnabled,
}: {
  s: ExternalSuggestion;
  parentPath: string[];
  target: string;
  executionEnabled: boolean;
}) {
  return (
    <List.Item
      title={s.title}
      subtitle={s.subtitle}
      icon={iconFor(s)}
      keywords={s.keywords}
      accessories={accessoriesFor(s)}
      actions={
        <CommandActions
          s={s}
          parentPath={parentPath}
          target={target}
          executionEnabled={executionEnabled}
        />
      }
    />
  );
}

function CommandActions({
  s,
  parentPath,
  target,
  executionEnabled,
}: {
  s: ExternalSuggestion;
  parentPath: string[];
  target: string;
  executionEnabled: boolean;
}) {
  if (s.type === "group" || s.type === "search") {
    return (
      <ActionPanel>
        <Action.Push
          title="Open"
          target={
            <CommandList
              path={[...parentPath, s.id]}
              target={target}
              isSearchPage={s.type === "search"}
              executionEnabled={executionEnabled}
            />
          }
        />
      </ActionPanel>
    );
  }

  if (s.type === "calculation") {
    return (
      <ActionPanel>
        <Action
          title="Copy Result"
          onAction={async () => {
            await Clipboard.copy(s.title);
            await showHUD("Copied to clipboard");
          }}
        />
      </ActionPanel>
    );
  }

  if (s.type === "action" || s.type === "submit") {
    return (
      <ActionPanel>
        <Action
          title="Run"
          onAction={() =>
            executionEnabled ? runCommand(s.id, target) : notRunnable()
          }
        />
      </ActionPanel>
    );
  }

  // display: informational, no primary action.
  return null;
}
