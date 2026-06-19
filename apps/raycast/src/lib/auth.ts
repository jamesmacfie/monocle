import { LocalStorage } from "@raycast/api";
import { randomUUID } from "node:crypto";

const INSTANCE_KEY = "monocle.instanceId";
const LEGACY_TOKEN_KEY = "monocle.token";
// Tokens are per-browser: a token minted by one browser's extension is only
// accepted by that extension. Key by the browser id ("chrome"/"firefox").
const tokenKey = (browserId: string) => `monocle.token.${browserId}`;

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

export const getToken = (browserId: string) =>
  LocalStorage.getItem<string>(tokenKey(browserId));
export const setToken = (browserId: string, t: string) =>
  LocalStorage.setItem(tokenKey(browserId), t);
// Clear the token but KEEP instanceId, so re-pairing dedupes cleanly.
export const clearToken = (browserId: string) =>
  LocalStorage.removeItem(tokenKey(browserId));

// One-time migration from the pre-multi-browser single-token key. Called only
// when exactly one browser is connected, so the legacy token unambiguously
// belongs to it — existing users don't have to re-pair.
export async function migrateLegacyToken(browserId: string): Promise<void> {
  const legacy = await LocalStorage.getItem<string>(LEGACY_TOKEN_KEY);
  if (!legacy) return;
  const existing = await LocalStorage.getItem<string>(tokenKey(browserId));
  if (!existing) await LocalStorage.setItem(tokenKey(browserId), legacy);
  await LocalStorage.removeItem(LEGACY_TOKEN_KEY);
}
