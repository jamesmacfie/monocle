import { useEffect, useState } from "react"
import { Icon } from "../../shared/components/Icon"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import {
  clearFeaturesError,
  executeFeatureAction,
  loadFeatures,
  selectFeatures,
  selectFeaturesError,
  selectFeaturesLoading,
  updateFeatureConfig,
} from "../../shared/store/slices/features.slice"
import type {
  FeatureDescriptor,
  FormField,
  RecordListItem,
} from "../../shared/types"
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { Badge, Button, Input, Panel, Switch } from "../components/ui"
import {
  INTEGRATION_PROVIDERS,
  type IntegrationProvider,
} from "../integrations/providers"

// The top-level on/off (and similar) switches a provider exposes, read straight
// from its settings schema so we don't restate field ids here.
const switchFields = (descriptor: FeatureDescriptor): FormField[] =>
  (descriptor.schema?.sections ?? [])
    .flatMap((section) => section.fields)
    .filter((field) => field.type === "switch")

export function IntegrationsPage() {
  const dispatch = useAppDispatch()
  const features = useAppSelector(selectFeatures)
  const loading = useAppSelector(selectFeaturesLoading)
  const error = useAppSelector(selectFeaturesError)

  // Per-request code input, keyed by requestId (pairingId).
  const [codes, setCodes] = useState<Record<string, string>>({})

  useEffect(() => {
    dispatch(loadFeatures())
  }, [dispatch])

  const providers = INTEGRATION_PROVIDERS.map((provider) => ({
    provider,
    descriptor: features.find((f) => f.id === provider.id),
  })).filter(
    (
      entry,
    ): entry is {
      provider: IntegrationProvider
      descriptor: FeatureDescriptor
    } => Boolean(entry.descriptor),
  )

  const setSwitch = async (
    descriptor: FeatureDescriptor,
    provider: IntegrationProvider,
    fieldId: string,
    value: boolean,
  ) => {
    // Request optional permissions from the enable gesture, like the generic
    // feature settings page does. The background re-checks the real grant.
    if (value && provider.enablePermissions) {
      try {
        await getBrowserAPI().permissions.request({
          permissions:
            provider.enablePermissions as chrome.runtime.ManifestPermissions[],
        })
      } catch {
        // Background still verifies the grant before acting.
      }
    }
    dispatch(
      updateFeatureConfig({
        featureId: descriptor.id,
        config: { ...descriptor.config, [fieldId]: value },
      }),
    )
  }

  const runAction = async (
    featureId: string,
    actionId: string,
    payload: Record<string, string | number | boolean>,
  ) => {
    dispatch(clearFeaturesError())
    await dispatch(executeFeatureAction({ featureId, actionId, payload }))
  }

  const accept = async (
    provider: IntegrationProvider,
    request: RecordListItem,
  ) => {
    const code = (codes[request.id] ?? "").trim()
    if (provider.requestsNeedCode && !code) {
      return
    }
    await runAction(provider.id, provider.acceptActionId, {
      itemId: request.id,
      value: code,
    })
    setCodes((prev) => {
      const next = { ...prev }
      delete next[request.id]
      return next
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Integrations</h1>
        <div className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Approve and manage desktop apps and extensions that connect to
          Monocle.
        </div>
      </header>

      {error ? (
        <div className="rounded-md border border-[var(--color-error-border)] bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error-fg)]">
          {error}
        </div>
      ) : null}

      {loading && features.length === 0 ? (
        <div className="text-sm text-[var(--color-fg-muted)]">Loading…</div>
      ) : null}

      {providers.map(({ provider, descriptor }) => {
        const requests = descriptor.lists?.[provider.requestsListId] ?? []
        const connected = descriptor.lists?.[provider.connectedListId] ?? []

        return (
          <Panel key={provider.id} className="space-y-5 p-5">
            <div className="flex items-center gap-3">
              <Icon icon={descriptor.icon} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{descriptor.name}</div>
                {descriptor.description ? (
                  <div className="text-sm text-[var(--color-fg-muted)]">
                    {descriptor.description}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Provider-level toggles (enable, allow execution, …). */}
            <div className="space-y-3">
              {switchFields(descriptor).map((field) => (
                <label
                  key={field.id}
                  className="flex cursor-pointer items-center justify-between gap-4"
                >
                  <span className="text-sm">{field.label ?? field.id}</span>
                  <Switch
                    checked={descriptor.config[field.id] === true}
                    onCheckedChange={(value) =>
                      setSwitch(descriptor, provider, field.id, value)
                    }
                  />
                </label>
              ))}
            </div>

            {/* Requests awaiting approval. */}
            <section className="space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Requests</h2>
                {requests.length > 0 ? <Badge>{requests.length}</Badge> : null}
              </div>
              {requests.length === 0 ? (
                <div className="text-sm text-[var(--color-fg-muted)]">
                  Nothing is requesting access.
                </div>
              ) : (
                <div className="space-y-2">
                  {requests.map((request) => (
                    <div
                      key={request.id}
                      className="flex flex-wrap items-center gap-3 rounded-md border border-[var(--color-border)] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">
                          {request.label}
                        </div>
                        {request.sublabel ? (
                          <div className="text-xs text-[var(--color-fg-muted)]">
                            {request.sublabel}
                          </div>
                        ) : null}
                      </div>
                      {provider.requestsNeedCode ? (
                        <Input
                          value={codes[request.id] ?? ""}
                          onChange={(e) =>
                            setCodes((prev) => ({
                              ...prev,
                              [request.id]: e.target.value,
                            }))
                          }
                          placeholder="Code from the app"
                          className="w-40"
                          inputMode="numeric"
                          autoComplete="off"
                        />
                      ) : null}
                      <Button
                        variant="default"
                        onClick={() => accept(provider, request)}
                      >
                        Accept
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          runAction(provider.id, provider.rejectActionId, {
                            itemId: request.id,
                          })
                        }
                      >
                        Reject
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Connected integrations. */}
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">Connected</h2>
              {connected.length === 0 ? (
                <div className="text-sm text-[var(--color-fg-muted)]">
                  Nothing connected yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {connected.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-md border border-[var(--color-border)] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{item.label}</div>
                        {item.sublabel ? (
                          <div className="text-xs text-[var(--color-fg-muted)]">
                            {item.sublabel}
                          </div>
                        ) : null}
                      </div>
                      <Button
                        variant="danger"
                        onClick={() =>
                          runAction(provider.id, provider.connectedActionId, {
                            itemId: item.id,
                          })
                        }
                      >
                        {provider.connectedActionLabel}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </Panel>
        )
      })}
    </div>
  )
}
