import {
  Action,
  ActionPanel,
  Detail,
  Icon,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { bridgeRequest, listInstances } from "./lib/bridge";
import { getInstanceId, setToken } from "./lib/auth";
import { BrowserPicker } from "./components/BrowserPicker";
import type { InstanceMeta } from "./lib/types";

const POLL_INTERVAL_MS = 2000;

/**
 * Pairing for ONE browser. `browserId` is both the daemon routing target and
 * the key the minted token is stored under (tokens are per-browser).
 *
 * Direction B: we ask the browser for a code, DISPLAY it here, and the human
 * types it on the browser's Integrations page. The browser mints the token on
 * Accept; we collect it by polling `pair/poll-status`.
 */
export function PairForm({ browserId }: { browserId: string }) {
  const { pop } = useNavigation();
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState("Requesting a pairing code…");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (pairingId: string) => {
      if (cancelled) return;
      const res = await bridgeRequest(
        "pair/poll-status",
        { pairingId },
        undefined,
        browserId,
      );
      if (cancelled) return;
      if (res.ok) {
        const result = res.result;
        if (result.status === "approved") {
          await setToken(browserId, result.token);
          await showToast({
            style: Toast.Style.Success,
            title: "Paired with Monocle",
          });
          pop();
          return;
        }
        if (result.status === "expired") {
          setCode(null);
          setStatus("Code expired — reopen Pair Monocle to retry.");
          return;
        }
        if (result.status === "rejected") {
          setCode(null);
          setStatus("Request was declined in the browser.");
          return;
        }
      }
      // pending (or a transient transport error) → keep polling
      timer = setTimeout(() => poll(pairingId), POLL_INTERVAL_MS);
    };

    (async () => {
      const res = await bridgeRequest(
        "pair/request",
        { client: { name: "Raycast", instanceId: await getInstanceId() } },
        undefined,
        browserId,
      );
      if (cancelled) return;
      if (res.ok) {
        setCode(res.result.code);
        setStatus(
          `Enter this code in your browser — Monocle → Settings → Integrations — within ${res.result.expiresInSeconds}s.`,
        );
        poll(res.result.pairingId);
      } else if (res.error.code === "not_enabled") {
        setStatus(
          "The bridge is off or no browser is connected. Enable it in Monocle and reopen.",
        );
      } else {
        setStatus(
          `Could not start pairing (${res.error.code}). Reopen Pair Monocle to retry.`,
        );
      }
    })();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [browserId]);

  const markdown = code
    ? `# Pair Monocle\n\n## \`${code}\`\n\n${status}`
    : `# Pair Monocle\n\n${status}`;

  return (
    <Detail
      markdown={markdown}
      actions={
        <ActionPanel>
          <Action title="Close" onAction={pop} />
        </ActionPanel>
      }
    />
  );
}

/**
 * Standalone "Pair Monocle" command. Like the search entry, it first asks the
 * daemon which browsers are connected: pick one to pair when ≥2, pair the sole
 * one directly, or explain when none are connected.
 */
export default function PairMonocle() {
  const [instances, setInstances] = useState<InstanceMeta[] | null>(null);

  useEffect(() => {
    (async () => setInstances(await listInstances()))();
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
    return <PairForm browserId={instances[0].id} />;
  }

  return (
    <BrowserPicker
      placeholder="Choose a browser to pair"
      instances={instances}
      renderTarget={(inst) => <PairForm browserId={inst.id} />}
    />
  );
}
