import { Action, ActionPanel, Icon, List } from "@raycast/api";
import type { ReactNode } from "react";
import type { InstanceMeta } from "../lib/types";

/**
 * A list of connected browsers; selecting one pushes whatever `renderTarget`
 * returns for it. Shared by both entry points (search + pair) so "pick a
 * browser" looks and behaves the same wherever it appears.
 */
export function BrowserPicker({
  instances,
  renderTarget,
  placeholder = "Choose a browser",
}: {
  instances: InstanceMeta[];
  renderTarget: (instance: InstanceMeta) => ReactNode;
  placeholder?: string;
}) {
  return (
    <List searchBarPlaceholder={placeholder}>
      {instances.map((inst) => (
        <List.Item
          key={inst.id}
          title={inst.name}
          // ponytail: Raycast ships no per-browser brand icons; a globe reads as
          // "a browser" well enough. Bundle brand assets if it ever matters.
          icon={Icon.Globe}
          actions={
            <ActionPanel>
              <Action.Push title="Open" target={renderTarget(inst)} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}
