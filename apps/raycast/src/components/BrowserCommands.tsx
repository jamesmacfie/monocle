import {
  Action,
  ActionPanel,
  Icon,
  List,
  openExtensionPreferences,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { bridgeRequest } from "../lib/bridge";
import { clearToken, getToken } from "../lib/auth";
import { CommandRow } from "./CommandRow";
import { PairForm } from "../pair-monocle";
import type {
  BridgeErrorCode,
  ExternalSuggestion,
  InstanceMeta,
} from "../lib/types";

type Phase = "loading" | "ready" | "needs-pairing" | "error";

/**
 * The active-tab command list for one connected browser. Every bridge call is
 * routed to `instance.id` and authed with that browser's own token (tokens are
 * per-browser). This is what the single-browser path renders directly and what
 * the multi-browser picker pushes per selection.
 */
export function BrowserCommands({ instance }: { instance: InstanceMeta }) {
  const target = instance.id;
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ExternalSuggestion[]>([]);
  const [phase, setPhase] = useState<Phase>("loading");
  const [errorCode, setErrorCode] = useState<BridgeErrorCode | "">("");
  const [executionEnabled, setExecutionEnabled] = useState(false);
  const [nonce, setNonce] = useState(0); // bump to force a refetch (retry)

  // Capability probe once on mount: can this browser execute commands?
  useEffect(() => {
    (async () => {
      const meta = await bridgeRequest("meta/info", {}, undefined, target);
      if (meta.ok) setExecutionEnabled(meta.result.executionEnabled);
    })();
  }, [target]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPhase((p) => (p === "ready" ? "ready" : "loading"));
      const token = await getToken(target);
      if (!token) {
        if (!cancelled) setPhase("needs-pairing");
        return;
      }
      const res = query.trim()
        ? await bridgeRequest(
            "suggestions/search-active-tab",
            { query, limit: 50 },
            token,
            target,
          )
        : await bridgeRequest(
            "suggestions/get-for-active-tab",
            { limit: 50, includeFavorites: true },
            token,
            target,
          );
      if (cancelled) return;
      if (res.ok) {
        setItems(res.result.suggestions);
        setPhase("ready");
      } else {
        if (
          res.error.code === "unauthorized" ||
          res.error.code === "forbidden_scope"
        ) {
          await clearToken(target);
          setPhase("needs-pairing");
        } else {
          setErrorCode(res.error.code);
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, nonce, target]);

  if (phase === "needs-pairing") {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Plug}
          title={`Pair with ${instance.name}`}
          description="Connect Raycast to this browser to see the active tab's commands."
          actions={
            <ActionPanel>
              <Action.Push
                title="Pair Monocle"
                target={<PairForm browserId={target} />}
              />
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

  if (phase === "error") {
    return (
      <List>
        <List.EmptyView
          icon={Icon.Warning}
          title={errorTitle(errorCode)}
          description={errorDescription(errorCode)}
          actions={
            <ActionPanel>
              <Action
                title="Retry"
                icon={Icon.ArrowClockwise}
                onAction={() => setNonce((n) => n + 1)}
              />
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

  return (
    <List
      isLoading={phase === "loading"}
      filtering={false}
      throttle
      onSearchTextChange={setQuery}
      searchBarPlaceholder={`Search ${instance.name}'s active-tab Monocle commands`}
      actions={
        <ActionPanel>
          <Action
            title="Forget Pairing"
            icon={Icon.Trash}
            onAction={async () => {
              await clearToken(target);
              setPhase("needs-pairing");
            }}
          />
        </ActionPanel>
      }
    >
      {items.map((s) => (
        <CommandRow
          key={s.id}
          s={s}
          parentPath={[]}
          target={target}
          executionEnabled={executionEnabled}
        />
      ))}
    </List>
  );
}

function errorTitle(code: BridgeErrorCode | ""): string {
  switch (code) {
    case "not_enabled":
      return "Bridge off or no browser connected";
    case "no_active_tab":
      return "No usable active tab";
    case "internal":
      return "Bridge error";
    default:
      return "Could not reach Monocle";
  }
}

function errorDescription(code: BridgeErrorCode | ""): string {
  switch (code) {
    case "not_enabled":
      return "Open your browser and enable the Monocle bridge, then retry. Make sure the Monocle Bridge app is running.";
    case "no_active_tab":
      return "Switch to a normal (non-incognito) browser tab and retry.";
    default:
      return "Make sure the Monocle Bridge app is running, then retry.";
  }
}
