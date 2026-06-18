import { LocalStorage } from "@raycast/api";
import { randomUUID } from "node:crypto";

const INSTANCE_KEY = "monocle.instanceId";
const TOKEN_KEY = "monocle.token";

// Stable per-installation id. Generated once and reused forever so re-pairing
// replaces the same client record in the extension instead of piling up dupes.
export async function getInstanceId(): Promise<string> {
  let id = await LocalStorage.getItem<string>(INSTANCE_KEY);
  if (!id) {
    id = randomUUID();
    await LocalStorage.setItem(INSTANCE_KEY, id);
  }
  return id;
}

export const getToken = () => LocalStorage.getItem<string>(TOKEN_KEY);
export const setToken = (t: string) => LocalStorage.setItem(TOKEN_KEY, t);
// Clear the token but KEEP instanceId, so re-pairing dedupes cleanly.
export const clearToken = () => LocalStorage.removeItem(TOKEN_KEY);
