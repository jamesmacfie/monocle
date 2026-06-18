import { ArrowLeft } from "lucide-react"
import { useEffect } from "react"
import { Link, useParams } from "wouter"
import { Icon } from "../../shared/components/Icon"
import { SurfaceHost } from "../../shared/components/SurfaceHost"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import {
  executeFeatureAction,
  loadFeatures,
  selectFeatureById,
  selectFeaturesError,
  selectFeaturesLoading,
  updateFeatureConfig,
} from "../../shared/store/slices/features.slice"
import { getBrowserAPI } from "../../shared/utils/extension-api"
import { SchemaForm } from "../components/SchemaForm"

// Features whose `enabled` toggle needs optional permissions before the
// background can act. Requested here, from the Save-click gesture (the options
// page is a real extension page, so permissions.request works), so the toggle
// behaves like the equivalent palette command. The background still gates on
// the actual grant, so a denied/failed request just leaves the feature inert.
// ponytail: one entry today; generalize to a descriptor field if a second
// feature needs gated permissions.
const PERMISSIONS_ON_ENABLE: Record<string, string[]> = {
  "native-messaging": ["nativeMessaging", "tabs"],
}

export function FeatureSettingsPage() {
  const params = useParams<{ id?: string }>()
  const featureId = params.id ?? ""
  const dispatch = useAppDispatch()
  const feature = useAppSelector(selectFeatureById(featureId))
  const loading = useAppSelector(selectFeaturesLoading)
  const error = useAppSelector(selectFeaturesError)
  const updating = useAppSelector((state) =>
    state.features.updatingIds.includes(featureId),
  )

  // Load on mount so the page works on a direct deep-link.
  useEffect(() => {
    dispatch(loadFeatures())
  }, [dispatch])

  const handleSave = async (config: Record<string, unknown>) => {
    const needed = PERMISSIONS_ON_ENABLE[featureId]
    if (needed && config.enabled === true) {
      try {
        await getBrowserAPI().permissions.request({
          permissions: needed as chrome.runtime.ManifestPermissions[],
        })
      } catch {
        // Background still verifies the real grant before opening the port.
      }
    }
    dispatch(updateFeatureConfig({ featureId, config }))
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/features"
        className="inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
      >
        <ArrowLeft className="h-4 w-4" />
        Features
      </Link>

      {error ? (
        <div className="rounded-md border border-[var(--color-error-border)] bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error-fg)]">
          {error}
        </div>
      ) : null}

      {!feature ? (
        <div className="text-sm text-[var(--color-fg-muted)]">
          {loading ? "Loading…" : "Feature not found."}
        </div>
      ) : (
        <>
          {/* The pairing code is pushed as a `modal` surface; render it here too
              so a user can pair while sitting on this settings page (which has no
              content host). Reuses the same surface the content overlay shows. */}
          {featureId === "native-messaging" ? (
            <SurfaceHost kinds={["modal"]} />
          ) : null}
          <header className="flex items-center gap-3">
            <Icon icon={feature.icon} />
            <div>
              <h1 className="text-2xl font-semibold">{feature.name}</h1>
              {feature.description ? (
                <div className="mt-1 text-sm text-[var(--color-fg-muted)]">
                  {feature.description}
                </div>
              ) : null}
            </div>
          </header>

          {feature.schema ? (
            <SchemaForm
              schema={feature.schema}
              config={feature.config}
              lists={feature.lists}
              busy={updating}
              onSave={handleSave}
              onAction={(action) =>
                dispatch(
                  executeFeatureAction({ featureId, actionId: action.id }),
                )
              }
              onItemAction={(_fieldId, actionId, payload) =>
                dispatch(executeFeatureAction({ featureId, actionId, payload }))
              }
            />
          ) : (
            <div className="text-sm text-[var(--color-fg-muted)]">
              This feature has no configurable settings.
            </div>
          )}
        </>
      )}
    </div>
  )
}
