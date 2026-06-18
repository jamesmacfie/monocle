import { List, showToast, Toast, useNavigation } from "@raycast/api";
import { useEffect, useState } from "react";
import { bridgeRequest } from "../lib/bridge";
import { clearToken, getToken } from "../lib/auth";
import { CommandRow } from "./CommandRow";
import type { BridgeErrorCode, ExternalSuggestion } from "../lib/types";

/**
 * A nested command page, reached by drilling into a group/search node. Fetches
 * the node's children via `suggestions/get-children` with the breadcrumb `path`.
 * Recurses: each group/search child pushes another CommandList with `path`
 * extended by that child's id (see CommandRow).
 */
export function CommandList({
  path,
  isSearchPage,
  executionEnabled,
}: {
  path: string[];
  isSearchPage: boolean;
  executionEnabled: boolean;
}) {
  const { pop } = useNavigation();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ExternalSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  // search pages re-query the server per keystroke; group pages filter locally.
  const effectiveQuery = isSearchPage ? query : "";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        if (!cancelled) setLoading(false);
        return;
      }
      const res = await bridgeRequest(
        "suggestions/get-children",
        { path, query: isSearchPage ? query : undefined, limit: 50 },
        token,
      );
      if (cancelled) return;
      if (res.ok) {
        setItems(res.result.suggestions);
      } else {
        if (res.error.code === "unauthorized" || res.error.code === "forbidden_scope") {
          await clearToken();
        }
        if (res.error.code === "not_found") {
          await showToast({ style: Toast.Style.Failure, title: "This list is no longer available" });
          pop();
        } else {
          await showToast({ style: Toast.Style.Failure, title: errorTitle(res.error.code) });
        }
        setItems([]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
    // path is stable for a given pushed view; effectiveQuery drives search pages.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path.join("/"), effectiveQuery]);

  return (
    <List
      isLoading={loading}
      filtering={!isSearchPage}
      throttle={isSearchPage}
      onSearchTextChange={isSearchPage ? setQuery : undefined}
    >
      <List.EmptyView title={loading ? "Loading…" : "Nothing here"} />
      {items.map((s) => (
        <CommandRow key={s.id} s={s} parentPath={path} executionEnabled={executionEnabled} />
      ))}
    </List>
  );
}

function errorTitle(code: BridgeErrorCode): string {
  switch (code) {
    case "no_active_tab":
      return "Switch to a normal browser tab";
    case "not_enabled":
      return "Open your browser and enable the Monocle bridge";
    case "unauthorized":
    case "forbidden_scope":
      return "Re-pair with Monocle";
    default:
      return "Bridge error";
  }
}
