import {
  Action,
  ActionPanel,
  Form,
  Icon,
  List,
  openExtensionPreferences,
  showToast,
  Toast,
  useNavigation,
} from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { bridgeRequest, listInstances } from "./lib/bridge";
import { getInstanceId, setToken } from "./lib/auth";
import { BrowserPicker } from "./components/BrowserPicker";
import type { BridgeErrorCode, InstanceMeta } from "./lib/types";

/**
 * The pairing form for ONE browser. `browserId` is both the daemon routing
 * target and the key the minted token is stored under (tokens are per-browser).
 */
export function PairForm({ browserId }: { browserId: string }) {
  const { pop } = useNavigation();
  const pairingId = useRef<string | null>(null);
  const [status, setStatus] = useState("Requesting a pairing code…");

  // Start pairing on mount: the browser shows a 6-digit code in a modal.
  useEffect(() => {
    (async () => {
      const res = await bridgeRequest(
        "pair/request",
        { client: { name: "Raycast", instanceId: await getInstanceId() } },
        undefined,
        browserId,
      );
      if (res.ok) {
        pairingId.current = res.result.pairingId;
        setStatus(
          `A code is showing in your browser. Enter it within ${res.result.expiresInSeconds}s.`,
        );
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
  }, [browserId]);

  async function onSubmit({ code }: { code: string }) {
    if (!pairingId.current) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Pairing hasn’t started — reopen Pair Monocle",
      });
      return;
    }
    const res = await bridgeRequest(
      "pair/submit-code",
      { pairingId: pairingId.current, code: code.trim() },
      undefined,
      browserId,
    );
    if (res.ok) {
      await setToken(browserId, res.result.token);
      await showToast({
        style: Toast.Style.Success,
        title: "Paired with Monocle",
      });
      pop();
    } else {
      await showToast({
        style: Toast.Style.Failure,
        title: pairingErrorTitle(res.error.code),
      });
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Pair" onSubmit={onSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text={status} />
      <Form.TextField
        id="code"
        title="Pairing code"
        placeholder="6-digit code from the browser"
      />
    </Form>
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

function pairingErrorTitle(code: BridgeErrorCode): string {
  switch (code) {
    case "pairing_expired":
      return "Code expired — restart pairing";
    case "pairing_rejected":
      return "Wrong code (or too many attempts) — restart pairing";
    case "not_enabled":
      return "Bridge is off / no browser connected";
    default:
      return "Pairing failed";
  }
}
