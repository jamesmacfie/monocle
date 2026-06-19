import {
  Action,
  ActionPanel,
  Icon,
  List,
  openExtensionPreferences,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { listInstances } from "./lib/bridge";
import { migrateLegacyToken } from "./lib/auth";
import { BrowserCommands } from "./components/BrowserCommands";
import { BrowserPicker } from "./components/BrowserPicker";
import type { InstanceMeta } from "./lib/types";

/**
 * Entry point. Asks the daemon which browsers are connected, then:
 *   0  → nothing to talk to (app off / no browser).
 *   1  → that browser's commands directly (no picker).
 *   ≥2 → a browser picker; selecting one opens its commands.
 * Browsers paired in the past but currently closed never appear — the daemon
 * only reports live connections.
 */
export default function SearchMonocle() {
  const [instances, setInstances] = useState<InstanceMeta[] | null>(null);

  useEffect(() => {
    (async () => {
      const list = await listInstances();
      // Single browser: claim any pre-multi-browser token for it so existing
      // users don't have to re-pair.
      if (list.length === 1) await migrateLegacyToken(list[0].id);
      setInstances(list);
    })();
  }, []);

  if (instances === null) {
    return <List isLoading searchBarPlaceholder="Connecting to Monocle…" />;
  }

  if (instances.length === 0) {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Plug}
          title="No browser connected"
          description="Open a browser with Monocle, enable the bridge, and make sure the Monocle Bridge app is running. Then reopen."
          actions={
            <ActionPanel>
              <Action
                title="Open Extension Preferences"
                onAction={openExtensionPreferences}
              />
            </ActionPanel>
          }
        />
      </List>
    );
  }

  if (instances.length === 1) {
    return <BrowserCommands instance={instances[0]} />;
  }

  return (
    <BrowserPicker
      instances={instances}
      renderTarget={(inst) => <BrowserCommands instance={inst} />}
    />
  );
}
