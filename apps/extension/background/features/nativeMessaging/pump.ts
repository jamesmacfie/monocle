// Architecture: background feature layer (Native Messaging bridge). The request
// pump: the bridge's protocol entry point, fed by the native-host port rather
// than the runtime message listener. It mirrors the in-extension router
// (validate-then-dispatch with a Zod schema + ts-pattern) but for the public
// wire protocol. Pure dispatch — no port/transport concerns live here, so it is
// unit-testable by calling handleBridgeRequest(request) directly. See
// docs/native-messaging/protocol.md.
import { match } from "ts-pattern"
import {
  BRIDGE_PROTOCOL_VERSION,
  BRIDGE_SCOPES,
  type BridgeRequest,
  BridgeRequestSchema,
  type BridgeResponse,
  bridgeError,
  bridgeOk,
} from "../../../shared/types"
import { isFirefox } from "../../../shared/utils/browser"
import { getBrowserAPI } from "../../../shared/utils/extension-api"
import { getFeatureConfig } from "../config"
import { authenticate } from "./auth"
import { executeForActiveTab } from "./execute"
import { beginPairing, submitCode } from "./pairing"
import { getForActiveTab, searchActiveTab } from "./suggestions"
import {
  NATIVE_MESSAGING_FEATURE_ID,
  type NativeMessagingConfig,
  nativeMessagingConfigDefaults,
} from "./types"

const extensionVersion = (): string => {
  try {
    return getBrowserAPI().runtime.getManifest().version ?? "0.0.0"
  } catch {
    return "0.0.0"
  }
}

const browserName = (): string => (isFirefox ? "firefox" : "chrome")

const readConfig = (): Promise<NativeMessagingConfig> =>
  getFeatureConfig<NativeMessagingConfig>(
    NATIVE_MESSAGING_FEATURE_ID,
    nativeMessagingConfigDefaults,
  )

const isEnabled = async (): Promise<boolean> => (await readConfig()).enabled

const isExecutionEnabled = async (): Promise<boolean> => {
  const config = await readConfig()
  return config.enabled && config.allowExecution
}

// Extract an echo id even from an unparseable request, so error responses still
// correlate. Falls back to "" when nothing usable is present.
const echoId = (raw: unknown): string => {
  if (raw && typeof raw === "object" && typeof (raw as any).id === "string") {
    return (raw as any).id
  }
  return ""
}

export const handleBridgeRequest = async (
  raw: unknown,
  now: number = Date.now(),
): Promise<BridgeResponse> => {
  const parsed = BridgeRequestSchema.safeParse(raw)
  if (!parsed.success) {
    return bridgeError(
      echoId(raw),
      "bad_request",
      parsed.error.issues[0]?.message ?? "Invalid request",
    )
  }

  const request: BridgeRequest = parsed.data
  const { id } = request

  try {
    return await match(request)
      .with({ method: "meta/info" }, async () =>
        bridgeOk(id, {
          protocolVersions: [BRIDGE_PROTOCOL_VERSION],
          scopes: [...BRIDGE_SCOPES],
          bridgeEnabled: await isEnabled(),
          executionEnabled: await isExecutionEnabled(),
          browser: {
            name: browserName(),
            channel: "stable",
            extensionVersion: extensionVersion(),
          },
        }),
      )
      .with({ method: "status" }, async () =>
        bridgeOk(id, {
          ok: true,
          browser: browserName(),
          channel: "stable",
          extensionVersion: extensionVersion(),
          bridgeEnabled: await isEnabled(),
          executionEnabled: await isExecutionEnabled(),
          portOwner: true,
        }),
      )
      .with({ method: "pair/request" }, async (req) => {
        if (!(await isEnabled())) {
          return bridgeError(id, "not_enabled", "Bridge is disabled")
        }
        const result = await beginPairing(req.params.client, now)
        return bridgeOk(id, result)
      })
      .with({ method: "pair/submit-code" }, async (req) => {
        const result = await submitCode(
          req.params.pairingId,
          req.params.code,
          now,
        )
        if (!result.ok) {
          return bridgeError(
            id,
            result.code,
            result.code === "pairing_expired"
              ? "Pairing code expired"
              : "Pairing rejected",
          )
        }
        return bridgeOk(id, {
          token: result.token,
          scopes: result.scopes,
        })
      })
      .with({ method: "suggestions/get-for-active-tab" }, async (req) => {
        const auth = await authenticate(
          req.auth?.token,
          "suggestions:read",
          now,
        )
        if (!auth.ok) {
          return bridgeError(id, auth.code, authMessage(auth.code))
        }
        const result = await getForActiveTab(req.params ?? {})
        if (!result) {
          return bridgeError(id, "no_active_tab", "No active tab")
        }
        return bridgeOk(id, result)
      })
      .with({ method: "suggestions/search-active-tab" }, async (req) => {
        const auth = await authenticate(
          req.auth?.token,
          "suggestions:read",
          now,
        )
        if (!auth.ok) {
          return bridgeError(id, auth.code, authMessage(auth.code))
        }
        const result = await searchActiveTab(req.params)
        if (!result) {
          return bridgeError(id, "no_active_tab", "No active tab")
        }
        return bridgeOk(id, result)
      })
      .with({ method: "commands/execute" }, async (req) => {
        const auth = await authenticate(
          req.auth?.token,
          "commands:execute",
          now,
        )
        if (!auth.ok) {
          return bridgeError(id, auth.code, authMessage(auth.code))
        }
        // Second layer: execution is off unless the user opted in globally,
        // even for a client whose token carries the scope.
        if (!(await isExecutionEnabled())) {
          return bridgeError(
            id,
            "execution_disabled",
            "Command execution is disabled",
          )
        }
        const result = await executeForActiveTab(req.params)
        if ("error" in result) {
          return bridgeError(id, result.error, authMessage(result.error))
        }
        return bridgeOk(id, result)
      })
      .exhaustive()
  } catch (error) {
    console.error("[native-messaging] request failed:", error)
    return bridgeError(id, "internal", "Internal error")
  }
}

// Human-readable message for an error code (the app branches on `code`, not
// this string). Covers both the auth codes and the execute codes.
const authMessage = (code: string): string =>
  match(code)
    .with("not_enabled", () => "Bridge is disabled")
    .with("forbidden_scope", () => "Token lacks the required scope")
    .with("execution_disabled", () => "Command execution is disabled")
    .with("not_found", () => "Command not found")
    .with("forbidden", () => "Command is not available to external apps")
    .with("no_active_tab", () => "No active tab")
    .with("execution_failed", () => "Command failed to run")
    .otherwise(() => "Unauthorized")
