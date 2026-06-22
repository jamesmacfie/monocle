import { ChevronRight } from "lucide-react"
import { useEffect } from "react"
import { Link } from "wouter"
import { Icon } from "../../shared/components/Icon"
import { useAppDispatch, useAppSelector } from "../../shared/store/hooks"
import {
  loadFeatures,
  selectFeatures,
  selectFeaturesError,
  selectFeaturesLoading,
} from "../../shared/store/slices/features.slice"
import { Panel } from "../components/ui"

export function FeaturesPage() {
  const dispatch = useAppDispatch()
  const allFeatures = useAppSelector(selectFeatures)
  const loading = useAppSelector(selectFeaturesLoading)
  const error = useAppSelector(selectFeaturesError)

  // Integration providers (e.g. the native bridge) manage themselves on the
  // Integrations page, not here.
  const features = allFeatures.filter((f) => !f.hiddenFromFeaturesPage)

  useEffect(() => {
    dispatch(loadFeatures())
  }, [dispatch])

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Features</h1>
        <div className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Configure Monocle features and their behavior.
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

      <div className="space-y-3">
        {features.map((feature) => (
          <Link
            key={feature.id}
            href={`/features/${feature.id}`}
            className="block"
          >
            <Panel className="flex items-center gap-4 p-4 transition-colors hover:bg-[var(--color-bg-hover)]">
              <Icon icon={feature.icon} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">{feature.name}</div>
                {feature.description ? (
                  <div className="text-sm text-[var(--color-fg-muted)]">
                    {feature.description}
                  </div>
                ) : null}
              </div>
              <ChevronRight className="h-4 w-4 text-[var(--color-fg-muted)]" />
            </Panel>
          </Link>
        ))}
      </div>
    </div>
  )
}
