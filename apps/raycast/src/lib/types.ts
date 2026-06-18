// Local mirror of the public bridge wire shapes. The source of truth lives in
// apps/extension/shared/types/nativeMessaging.ts; this app is isolated (npm, not
// pnpm workspace) so the types are duplicated here rather than imported.

export type ExternalSuggestion = {
  id: string;
  type: "action" | "submit" | "group" | "search" | "display" | "calculation";
  title: string;
  subtitle?: string;
  icon?: string; // Lucide icon NAME or an http(s) URL
  keywords?: string[];
  requiresPermission?: string[];
};

export type BridgeErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden_scope"
  | "not_enabled"
  | "pairing_expired"
  | "pairing_rejected"
  | "rate_limited"
  | "no_active_tab"
  | "internal"
  | "not_found"
  | "forbidden"
  | "execution_disabled"
  | "execution_failed";

export type BridgeOk<T> = { ok: true; result: T };
export type BridgeErr = { ok: false; error: { code: BridgeErrorCode; message: string } };
export type BridgeReply<T> = BridgeOk<T> | BridgeErr;

export type MetaInfo = {
  protocolVersions: number[];
  scopes: string[];
  bridgeEnabled: boolean;
  executionEnabled: boolean;
  browser: { name: string; channel?: string; extensionVersion?: string };
};

export type SuggestionsResult = {
  url: string;
  title: string;
  query?: string;
  path?: string[];
  suggestions: ExternalSuggestion[];
};

export type ExecuteResult = {
  ran: true;
  focused?: boolean;
  value?: string;
  contentType?: string;
};

// Extension-level preferences (manifest `preferences`). Declared locally so a
// bare `tsc` check works without ray's generated raycast-env.d.ts.
export type Prefs = { port?: string; host?: string };
