import {
  Clipboard,
  closeMainWindow,
  showHUD,
  showToast,
  Toast,
} from "@raycast/api";
import { bridgeRequest } from "./bridge";
import { clearToken, getToken } from "./auth";
import type { BridgeErrorCode } from "./types";

function executeErrorTitle(code: BridgeErrorCode): string {
  switch (code) {
    case "execution_disabled":
      return "Enable “Allow command execution” in Monocle settings";
    case "forbidden":
      return "Not available from Raycast";
    case "not_found":
      return "Command not found — refresh the list";
    case "no_active_tab":
      return "Switch to a normal browser tab";
    case "forbidden_scope":
    case "unauthorized":
      return "Re-pair with Monocle";
    case "execution_failed":
      return "Command failed to run";
    default:
      return "Bridge error";
  }
}

/**
 * Run a command by id against the active tab and handle the three result shapes:
 *   value present  → copy + HUD (the bridge does NOT write the browser clipboard)
 *   focused:true   → browser was raised, close the Raycast window
 *   ran:true only  → silent side-effect, success toast
 */
export async function runCommand(id: string, target: string): Promise<void> {
  const token = await getToken(target);
  if (!token) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Pair with Monocle first",
    });
    return;
  }

  const res = await bridgeRequest("commands/execute", { id }, token, target);
  if (!res.ok) {
    if (
      res.error.code === "unauthorized" ||
      res.error.code === "forbidden_scope"
    ) {
      await clearToken(target);
    }
    await showToast({
      style: Toast.Style.Failure,
      title: executeErrorTitle(res.error.code),
    });
    return;
  }

  const r = res.result;
  if (r.value) {
    await Clipboard.copy(r.value);
    await showHUD("Copied to clipboard");
  } else if (r.focused) {
    await closeMainWindow();
  } else {
    await showToast({ style: Toast.Style.Success, title: "Done" });
  }
}
