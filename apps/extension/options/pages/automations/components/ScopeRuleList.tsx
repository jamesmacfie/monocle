// Architecture: options/ page-local UI for the Automations builder Scope
// section. Renders one URL-rule list (allow or deny) as one input per row. On
// ALLOW rows it also shows live host-permission status and an inline Grant /
// Revoke control: a urlMatch trigger only fires if Monocle's content script
// auto-injects on the host, which needs a persistent host permission. The
// grant calls chrome.permissions.request DIRECTLY in the click handler — a
// button click in the (privileged) options page is a valid user gesture, and
// an async background round-trip would lose it (same reason PermissionActions
// calls the API directly). Origin derivation is the pure
// shared/utils/url-rule-permission helper.
import { Check, Plus, Trash2, X } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { getBrowserAPI } from "../../../../shared/utils/extension-api"
import {
  type DerivedHostPermission,
  originPatternFromUrlRule,
} from "../../../../shared/utils/url-rule-permission"
import { Badge, Button, Input } from "../../../components/ui"

const browserAPI = getBrowserAPI()

type ScopeRuleListProps = {
  rows: string[]
  onChange: (rows: string[]) => void
  placeholder: string
  // Allow lists show the host-permission affordance; deny lists do not.
  withPermissions?: boolean
}

const originKey = (origins: string[]): string => origins.join("|")

export function ScopeRuleList({
  rows,
  onChange,
  placeholder,
  withPermissions = false,
}: ScopeRuleListProps) {
  // Granted state keyed by origin-group. undefined = not yet checked.
  const [granted, setGranted] = useState<Record<string, boolean>>({})
  const [reloadHints, setReloadHints] = useState<Record<string, boolean>>({})

  const refreshStatuses = useCallback(async () => {
    if (!withPermissions) {
      return
    }
    const groups = new Map<string, string[]>()
    for (const row of rows) {
      const derived = originPatternFromUrlRule(row)
      if (derived.ok && derived.grantable) {
        groups.set(originKey(derived.origins), derived.origins)
      }
    }
    const next: Record<string, boolean> = {}
    await Promise.all(
      [...groups.entries()].map(async ([key, origins]) => {
        try {
          next[key] = await browserAPI.permissions.contains({ origins })
        } catch {
          next[key] = false
        }
      }),
    )
    setGranted(next)
  }, [rows, withPermissions])

  useEffect(() => {
    void refreshStatuses()
  }, [refreshStatuses])

  // Reflect grants/revocations made elsewhere (e.g. chrome://extensions).
  useEffect(() => {
    if (!withPermissions) {
      return
    }
    const handler = () => {
      void refreshStatuses()
    }
    browserAPI.permissions.onAdded?.addListener(handler)
    browserAPI.permissions.onRemoved?.addListener(handler)
    return () => {
      browserAPI.permissions.onAdded?.removeListener(handler)
      browserAPI.permissions.onRemoved?.removeListener(handler)
    }
  }, [refreshStatuses, withPermissions])

  const setRow = (index: number, value: string) => {
    const next = [...rows]
    next[index] = value
    onChange(next)
  }

  const removeRow = (index: number) => {
    onChange(rows.filter((_, i) => i !== index))
  }

  const grant = async (origins: string[]) => {
    const key = originKey(origins)
    try {
      const ok = await browserAPI.permissions.request({ origins })
      if (ok) {
        setReloadHints((prev) => ({ ...prev, [key]: true }))
      }
    } catch {
      // Denied or unavailable — status refresh below reflects reality.
    }
    await refreshStatuses()
  }

  const revoke = async (origins: string[]) => {
    const key = originKey(origins)
    try {
      await browserAPI.permissions.remove({ origins })
    } catch {
      // Ignore; refresh reflects the real state.
    }
    setReloadHints((prev) => {
      const next = { ...prev }
      delete next[key]
      return next
    })
    await refreshStatuses()
  }

  return (
    <div className="grid gap-2">
      {rows.map((row, index) => {
        const derived: DerivedHostPermission | null = withPermissions
          ? originPatternFromUrlRule(row)
          : null
        const key =
          derived?.ok && derived.grantable ? originKey(derived.origins) : null
        const isGranted = key ? granted[key] === true : false

        return (
          <div key={index} className="grid gap-1.5">
            <div className="flex items-center gap-2">
              <Input
                aria-label="URL pattern"
                className="min-w-0 flex-1 font-mono text-xs"
                placeholder={placeholder}
                value={row}
                onChange={(event) => setRow(index, event.target.value)}
              />
              <Button
                aria-label="Remove pattern"
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => removeRow(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {withPermissions && row.trim() !== "" && (
              <div className="flex min-h-6 flex-wrap items-center gap-2 pl-1">
                <PermissionChip
                  derived={derived}
                  isGranted={isGranted}
                  onGrant={grant}
                  onRevoke={revoke}
                />
              </div>
            )}
            {key && isGranted && reloadHints[key] && (
              <p className="pl-1 text-xs text-[var(--color-fg-muted)]">
                Reload open tabs on this host for triggers to start firing.
              </p>
            )}
          </div>
        )
      })}

      <div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => onChange([...rows, ""])}
        >
          <Plus className="h-4 w-4" />
          Add pattern
        </Button>
      </div>
    </div>
  )
}

function PermissionChip({
  derived,
  isGranted,
  onGrant,
  onRevoke,
}: {
  derived: DerivedHostPermission | null
  isGranted: boolean
  onGrant: (origins: string[]) => void
  onRevoke: (origins: string[]) => void
}) {
  if (!derived || !derived.ok) {
    return <Badge>Invalid pattern</Badge>
  }

  if (!derived.grantable) {
    return <Badge>Specific host needed to grant access</Badge>
  }

  if (isGranted) {
    return (
      <>
        <Badge className="gap-1 border-[var(--color-success-border)] bg-[var(--color-success-bg)] text-[var(--color-success-fg)]">
          <Check className="h-3 w-3" />
          {derived.host} granted
        </Badge>
        <Button
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => onRevoke(derived.origins)}
        >
          Revoke
        </Button>
      </>
    )
  }

  return (
    <>
      <Badge className="gap-1">
        <X className="h-3 w-3" />
        {derived.host} not granted
      </Badge>
      <Button
        size="sm"
        type="button"
        variant="secondary"
        onClick={() => onGrant(derived.origins)}
      >
        Grant access
      </Button>
    </>
  )
}
