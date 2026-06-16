// Architecture: options UI. Generic renderer for a feature's settings schema
// (shared/types/feature.ts → FeatureSettingsSchema). Maps each FormField
// variant to an options-page control and renders action buttons. The palette's
// CommandItem/* renderers are CMDK list items and are NOT reusable here, so
// this is dedicated options code; grow it lockstep as features need more field
// types. See docs/features.md.
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import type {
  FeatureSettingsAction,
  FeatureSettingsSchema,
  FormField,
  RecordListAction,
  RecordListItem,
} from "../../shared/types"
import { Button, Input, Panel, Select, Switch } from "./ui"

// Payload shape for a record-list row action (mirrors FeatureActionPayload).
type ItemActionPayload = Record<string, string | number | boolean>

type DraftValue = string | string[] | boolean

type Draft = Record<string, DraftValue>

// Read the saved value for one field out of the persisted config and coerce it
// into the draft representation the control expects (boolean for switches,
// string[] for lists, string for everything incl. numbers — number inputs are
// edited as strings and re-parsed on save). Missing values fall back to a typed
// empty so controls stay controlled.
const initialValue = (
  field: FormField,
  config: Record<string, unknown>,
): DraftValue => {
  const raw = config[field.id]
  switch (field.type) {
    case "switch":
    case "checkbox":
      return Boolean(raw)
    case "text-list":
    case "multi":
      return Array.isArray(raw) ? (raw as string[]) : []
    case "number":
      return raw != null ? String(raw) : ""
    case "record-list":
      // Record-list rows are not draft-edited; rendered from descriptor.lists.
      return ""
    default:
      return raw != null ? String(raw) : ""
  }
}

// Inverse of initialValue: project the in-progress draft back into a plain
// config object for persistence, coercing each field to its real type (boolean,
// trimmed non-empty string[], number — empty number becomes NaN so the
// feature's Zod configSchema rejects it). Only schema-declared fields are
// emitted, dropping any stale draft keys. `saved` is the persisted config, used
// to carry record-list values through untouched.
const buildConfig = (
  schema: FeatureSettingsSchema,
  draft: Draft,
  saved: Record<string, unknown>,
): Record<string, unknown> => {
  const config: Record<string, unknown> = {}
  for (const section of schema.sections) {
    for (const field of section.fields) {
      // Record-list values are feature-owned and mutated via row actions, not
      // through the draft. Preserve the persisted value so saving other fields
      // doesn't drop them (the feature's configSchema usually requires them).
      if (field.type === "record-list") {
        config[field.id] = saved[field.id]
        continue
      }
      const value = draft[field.id]
      switch (field.type) {
        case "switch":
        case "checkbox":
          config[field.id] = Boolean(value)
          break
        case "text-list":
        case "multi":
          config[field.id] = (Array.isArray(value) ? value : [])
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
          break
        case "number":
          config[field.id] = value === "" ? Number.NaN : Number(value)
          break
        default:
          config[field.id] = typeof value === "string" ? value : ""
      }
    }
  }
  return config
}

// Editable list of free-text rows (used for `text-list` / `multi` fields, e.g.
// the Focus Mode blocklist). Add/remove/edit rows positionally; the parent owns
// the array and trimming/empty-filtering happens in buildConfig on save.
function TextListField({
  value,
  placeholder,
  onChange,
}: {
  value: string[]
  placeholder?: string
  onChange: (next: string[]) => void
}) {
  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <div className="text-sm text-[var(--color-fg-muted)]">
          No entries yet.
        </div>
      ) : null}
      {value.map((entry, index) => (
        <div
          // Index keys are fine here: rows are positional and edited in place.
          key={`row-${index}`}
          className="flex items-center gap-2"
        >
          <Input
            value={entry}
            placeholder={placeholder}
            onChange={(event) => {
              const next = [...value]
              next[index] = event.target.value
              onChange(next)
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Remove entry"
            onClick={() => onChange(value.filter((_, i) => i !== index))}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        onClick={() => onChange([...value, ""])}
      >
        <Plus className="h-4 w-4" />
        Add
      </Button>
    </div>
  )
}

// One action button on a record-list row. `editLabel` actions don't fire here;
// the parent row swaps in an inline editor and dispatches on confirm.
function RowActionButton({
  label,
  style,
  disabled,
  onClick,
}: {
  label: string
  style?: "default" | "primary" | "danger"
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={style === "danger" ? "danger" : "secondary"}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  )
}

// One row in a record-list: a group (with optional expandable children) or a
// child. Buttons dispatch the field's declared actions with a payload that
// identifies the row; `editLabel` actions open an inline rename editor.
function RecordListRow({
  item,
  actions,
  childActions,
  basePayload,
  busy,
  onItemAction,
}: {
  item: RecordListItem
  actions: RecordListAction[]
  childActions?: RecordListAction[]
  basePayload: ItemActionPayload
  busy?: boolean
  onItemAction: (actionId: string, payload: ItemActionPayload) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const hasChildren = Boolean(item.children && item.children.length > 0)
  const expandable = Boolean(childActions)

  return (
    <div className="rounded-md border border-[var(--color-border)]">
      <div className="flex items-center gap-2 px-3 py-2">
        {expandable ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={expanded ? "Collapse" : "Expand"}
            disabled={!hasChildren}
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        ) : null}
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                value={editValue}
                autoFocus
                onChange={(event) => setEditValue(event.target.value)}
              />
              <Button
                type="button"
                size="sm"
                disabled={busy || editValue.trim().length === 0}
                onClick={() => {
                  onItemAction(editing, {
                    ...basePayload,
                    value: editValue.trim(),
                  })
                  setEditing(null)
                }}
              >
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setEditing(null)}
              >
                Cancel
              </Button>
            </div>
          ) : (
            <>
              <div className="truncate text-sm font-medium">{item.label}</div>
              {item.sublabel ? (
                <div className="truncate text-xs text-[var(--color-fg-muted)]">
                  {item.sublabel}
                </div>
              ) : null}
            </>
          )}
        </div>
        {editing ? null : (
          <div className="flex shrink-0 items-center gap-2">
            {actions.map((action) => (
              <RowActionButton
                key={action.id}
                label={action.label}
                style={action.style}
                disabled={busy}
                onClick={() => {
                  if (action.editLabel) {
                    setEditValue(item.label)
                    setEditing(action.id)
                    return
                  }
                  onItemAction(action.id, basePayload)
                }}
              />
            ))}
          </div>
        )}
      </div>
      {expanded && item.children ? (
        <div className="space-y-2 border-t border-[var(--color-border)] px-3 py-2">
          {item.children.map((child) => (
            <RecordListRow
              key={child.id}
              item={child}
              actions={childActions ?? []}
              basePayload={{ ...basePayload, childId: child.id }}
              busy={busy}
              onItemAction={onItemAction}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

// A `record-list` field: a list of feature-owned rows from descriptor.lists,
// each carrying group-level itemActions and (when expanded) per-child
// childActions. Lives outside the draft — actions dispatch immediately.
function RecordListField({
  field,
  items,
  busy,
  onItemAction,
}: {
  field: Extract<FormField, { type: "record-list" }>
  items: RecordListItem[]
  busy?: boolean
  onItemAction: (actionId: string, payload: ItemActionPayload) => void
}) {
  if (items.length === 0) {
    return (
      <div className="text-sm text-[var(--color-fg-muted)]">
        {field.emptyText ?? "No entries yet."}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <RecordListRow
          key={item.id}
          item={item}
          actions={field.itemActions}
          childActions={field.childActions}
          basePayload={{ itemId: item.id }}
          busy={busy}
          onItemAction={onItemAction}
        />
      ))}
    </div>
  )
}

// Render the single control for one FormField variant. The switch is the
// field-type → control mapping; the `default` branch handles text/textarea/
// color/etc. as a plain text input. Grow lockstep with FormField in
// shared/types/ui.ts.
function FieldControl({
  field,
  value,
  onChange,
}: {
  field: FormField
  value: DraftValue
  onChange: (next: DraftValue) => void
}) {
  switch (field.type) {
    case "switch":
    case "checkbox":
      return (
        <Switch
          checked={Boolean(value)}
          onCheckedChange={(checked) => onChange(checked)}
        />
      )
    case "text-list":
    case "multi":
      return (
        <TextListField
          value={Array.isArray(value) ? value : []}
          placeholder={
            field.type === "text-list" ? field.placeholder : undefined
          }
          onChange={onChange}
        />
      )
    case "select":
      return (
        <Select
          value={typeof value === "string" ? value : ""}
          onChange={(event) => onChange(event.target.value)}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      )
    case "number":
      return (
        <Input
          type="number"
          value={typeof value === "string" ? value : ""}
          min={field.min}
          max={field.max}
          step={field.step}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    default:
      return (
        <Input
          value={typeof value === "string" ? value : ""}
          placeholder={"placeholder" in field ? field.placeholder : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )
  }
}

/**
 * Render a feature's settings schema as an editable form with local draft/dirty
 * state. The draft is built from `config` and re-synced when `config` changes
 * (e.g. storage.onChanged), so external updates don't clobber the form's shape.
 * `dirty` is a structural compare against the mount-time draft; Save is gated on
 * it and emits a freshly-coerced config via buildConfig. Action buttons run
 * against SAVED config, so they're disabled while the draft is dirty. See
 * docs/features.md.
 */
export function SchemaForm({
  schema,
  config,
  lists,
  busy,
  onSave,
  onAction,
  onItemAction,
}: {
  schema: FeatureSettingsSchema
  config: Record<string, unknown>
  lists?: Record<string, RecordListItem[]>
  busy?: boolean
  onSave: (config: Record<string, unknown>) => void
  onAction?: (action: FeatureSettingsAction) => void
  onItemAction?: (
    fieldId: string,
    actionId: string,
    payload: ItemActionPayload,
  ) => void
}) {
  const buildInitialDraft = useMemo(
    () => (): Draft => {
      const draft: Draft = {}
      for (const section of schema.sections) {
        for (const field of section.fields) {
          draft[field.id] = initialValue(field, config)
        }
      }
      return draft
    },
    [schema, config],
  )

  const [draft, setDraft] = useState<Draft>(buildInitialDraft)

  // Re-sync when the persisted config changes (e.g. storage.onChanged).
  useEffect(() => {
    setDraft(buildInitialDraft())
  }, [buildInitialDraft])

  const initialDraft = useMemo(buildInitialDraft, [])
  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initialDraft),
    [draft, initialDraft],
  )

  const setField = (id: string, next: DraftValue) =>
    setDraft((prev) => ({ ...prev, [id]: next }))

  return (
    <div className="space-y-6">
      {schema.sections.map((section, sectionIndex) => (
        <Panel key={section.title ?? `section-${sectionIndex}`} className="p-5">
          {section.title ? (
            <h2 className="text-base font-semibold">{section.title}</h2>
          ) : null}
          {section.description ? (
            <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
              {section.description}
            </p>
          ) : null}
          <div className="mt-4 space-y-5">
            {section.fields.map((field) => (
              <div key={field.id} className="space-y-2">
                <label className="block text-sm font-medium">
                  {field.label}
                </label>
                {field.type === "record-list" ? (
                  <RecordListField
                    field={field}
                    items={lists?.[field.id] ?? []}
                    busy={busy}
                    onItemAction={(actionId, payload) =>
                      onItemAction?.(field.id, actionId, payload)
                    }
                  />
                ) : (
                  <FieldControl
                    field={field}
                    value={draft[field.id]}
                    onChange={(next) => setField(field.id, next)}
                  />
                )}
              </div>
            ))}
          </div>
        </Panel>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={busy || !dirty}
          onClick={() => onSave(buildConfig(schema, draft, config))}
        >
          Save
        </Button>
        {dirty ? (
          <span className="text-sm text-[var(--color-fg-muted)]">
            Unsaved changes
          </span>
        ) : null}
        <div className="flex-1" />
        {schema.actions?.map((action) => (
          <Button
            key={action.id}
            type="button"
            variant={action.style === "danger" ? "danger" : "secondary"}
            // Actions act on saved config, so block them while the draft is dirty.
            disabled={busy || dirty}
            onClick={() => onAction?.(action)}
          >
            {action.label}
          </Button>
        ))}
      </div>
    </div>
  )
}
