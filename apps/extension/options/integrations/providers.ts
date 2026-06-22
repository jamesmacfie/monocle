// Architecture: options layer. Static description of which feature modules are
// "integration providers" — surfaced on the bespoke Integrations page rather
// than the generic Features page. Each maps the feature's record-list field ids
// onto the page's two sections: pending requests (Accept/Reject, optionally code
// -gated) and connected integrations (Revoke). The Integrations page and the
// nav badge both read this. See docs/native-messaging/ and docs/features.md.
//
// ponytail: one provider today (the native bridge). The extension-to-extension
// feature, when built, slots in as a second entry with requestsNeedCode:false
// (browser-verified identity — a plain Accept, no code). See
// docs/extension-extension/.
import type { FeatureDescriptor } from "../../shared/types"

export type IntegrationProvider = {
  // Feature id (matches FeatureModule.id).
  id: string
  // record-list field id holding requests awaiting Accept/Reject.
  requestsListId: string
  // Whether accepting a request requires the human to type a code the app
  // displays (loopback apps) vs a plain Accept (identity-verified extensions).
  requestsNeedCode: boolean
  // Feature handleAction ids for accepting / rejecting a pending request.
  acceptActionId: string
  rejectActionId: string
  // record-list field id holding connected/approved integrations.
  connectedListId: string
  // Action id + label for removing a connected integration.
  connectedActionId: string
  connectedActionLabel: string
  // Optional permissions to request from the enable gesture (the options page
  // can call permissions.request). Mirrors FeatureSettingsPage's map.
  enablePermissions?: string[]
}

export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  {
    id: "native-messaging",
    requestsListId: "pendingRequests",
    requestsNeedCode: true,
    acceptActionId: "accept",
    rejectActionId: "reject",
    connectedListId: "pairedClients",
    connectedActionId: "revoke",
    connectedActionLabel: "Revoke",
    enablePermissions: ["nativeMessaging", "tabs"],
  },
  {
    id: "external-extensions",
    requestsListId: "pending",
    // Browser-verified identity → a plain Approve, no code.
    requestsNeedCode: false,
    acceptActionId: "approve",
    rejectActionId: "dismiss",
    connectedListId: "approved",
    connectedActionId: "revoke",
    connectedActionLabel: "Revoke",
  },
]

export const isIntegrationProvider = (featureId: string): boolean =>
  INTEGRATION_PROVIDERS.some((p) => p.id === featureId)

// Total pending requests across all providers — drives the nav + toolbar badge.
export const countPendingRequests = (features: FeatureDescriptor[]): number => {
  let total = 0
  for (const provider of INTEGRATION_PROVIDERS) {
    const descriptor = features.find((f) => f.id === provider.id)
    total += descriptor?.lists?.[provider.requestsListId]?.length ?? 0
  }
  return total
}
