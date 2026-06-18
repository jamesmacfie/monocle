import { Action, ActionPanel, Form, showToast, Toast, useNavigation } from "@raycast/api";
import { useEffect, useRef, useState } from "react";
import { bridgeRequest } from "./lib/bridge";
import { getInstanceId, setToken } from "./lib/auth";

export default function PairMonocle() {
  const { pop } = useNavigation();
  const pairingId = useRef<string | null>(null);
  const [status, setStatus] = useState("Requesting a pairing code…");

  // Start pairing on mount: the browser shows a 6-digit code in a modal.
  useEffect(() => {
    (async () => {
      const res = await bridgeRequest<{ pairingId: string; expiresInSeconds: number }>("pair/request", {
        client: { name: "Raycast", instanceId: await getInstanceId() },
      });
      if (res.ok) {
        pairingId.current = res.result.pairingId;
        setStatus(`A code is showing in your browser. Enter it within ${res.result.expiresInSeconds}s.`);
      } else if (res.error.code === "not_enabled") {
        setStatus("The bridge is off or no browser is connected. Enable it in Monocle and reopen.");
      } else {
        setStatus(`Could not start pairing (${res.error.code}). Reopen Pair Monocle to retry.`);
      }
    })();
  }, []);

  async function onSubmit({ code }: { code: string }) {
    if (!pairingId.current) {
      await showToast({ style: Toast.Style.Failure, title: "Pairing hasn’t started — reopen Pair Monocle" });
      return;
    }
    const res = await bridgeRequest<{ token: string; scopes: string[] }>("pair/submit-code", {
      pairingId: pairingId.current,
      code: code.trim(),
    });
    if (res.ok) {
      await setToken(res.result.token);
      await showToast({ style: Toast.Style.Success, title: "Paired with Monocle" });
      pop();
    } else {
      await showToast({ style: Toast.Style.Failure, title: pairingErrorTitle(res.error.code) });
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
      <Form.TextField id="code" title="Pairing code" placeholder="6-digit code from the browser" />
    </Form>
  );
}

function pairingErrorTitle(code: string): string {
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
