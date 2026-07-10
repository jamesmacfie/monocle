// Architecture: options/ page layer. The Automations builder: edits one
// automation document as form state (editorState.ts), validates the
// assembled draft on every change with the exact schema the background
// enforces (shared/types/automationValidation.ts), surfaces unknown
// {{variable}} references as non-blocking warnings, and saves via the
// automations slice thunks — the page renders data and sends messages, it
// never holds executable command functions. Serves both /automations/new
// and /automations/:id (wouter hash routes registered in OptionsApp).
import { ArrowLeft, Play, Plus } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link, useLocation, useParams } from "wouter"
import { useAppDispatch, useAppSelector } from "../../../shared/store/hooks"
import {
  addAutomation,
  clearLastRunResult,
  runAutomation,
  selectAutomations,
  selectAutomationsError,
  selectAutomationsLastRunResult,
  selectAutomationsLoading,
  selectAutomationsRunningIds,
  updateAutomation,
} from "../../../shared/store/slices/automations.slice"
import { selectSnippets } from "../../../shared/store/slices/snippets.slice"
import type {
  AutomationStep,
  ColorName,
  EnsureHostPermissionResponse,
  IconName,
} from "../../../shared/types"
import { validateAutomationDraft } from "../../../shared/types/automationValidation"
import { automationTouchesPage } from "../../../shared/utils/automation-introspection"
import { sendRuntimeMessage } from "../../../shared/utils/extension-api"
import {
  Button,
  Checkbox,
  Input,
  Panel,
  Select,
  Textarea,
} from "../../components/ui"
import { ScopeRuleList } from "./components/ScopeRuleList"
import {
  AUTOMATION_COLOR_OPTIONS,
  AUTOMATION_ICON_OPTIONS,
  assembleDraft,
  collectTemplateWarnings,
  createDefaultStepRow,
  createEmptyEditorState,
  EDITOR_INDEXED_COLLECTIONS,
  type EditorDraftState,
  editorStateFromScript,
  groupIssuesByIndex,
  STEP_OP_OPTIONS,
} from "./editorState"
import { StepRow } from "./StepRow"
import { TriggersEditor } from "./TriggersEditor"
import { VariablesEditor } from "./VariablesEditor"

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <Panel className="p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {description && (
        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
          {description}
        </p>
      )}
      <div className="mt-3 grid gap-3">{children}</div>
    </Panel>
  )
}

export function AutomationEditorPage() {
  const dispatch = useAppDispatch()
  const [, navigate] = useLocation()
  const params = useParams<{ id?: string }>()
  const automationId = params.id

  const scripts = useAppSelector(selectAutomations)
  const loading = useAppSelector(selectAutomationsLoading)
  const sliceError = useAppSelector(selectAutomationsError)
  const snippets = useAppSelector(selectSnippets)
  const runningIds = useAppSelector(selectAutomationsRunningIds)
  const lastRunResult = useAppSelector(selectAutomationsLastRunResult)

  const isNew = !automationId
  const script = useMemo(
    () => scripts.find((entry) => entry.id === automationId),
    [scripts, automationId],
  )

  const [state, setState] = useState<EditorDraftState | null>(null)
  const [addOp, setAddOp] = useState<AutomationStep["op"]>("click")
  const [saving, setSaving] = useState(false)
  const [hostAccessWarning, setHostAccessWarning] = useState<string | null>(
    null,
  )

  useEffect(() => {
    dispatch(clearLastRunResult())
  }, [dispatch])

  useEffect(() => {
    if (state !== null) {
      return
    }
    if (isNew) {
      setState(createEmptyEditorState())
      return
    }
    if (script) {
      setState(editorStateFromScript(script))
    }
  }, [isNew, script, state])

  const assembled = useMemo(
    () => (state ? assembleDraft(state) : null),
    [state],
  )
  const validation = useMemo(
    () =>
      assembled?.draft != null
        ? validateAutomationDraft(assembled.draft)
        : null,
    [assembled],
  )
  const validationErrors =
    validation && !validation.success ? validation.errors : []
  const warnings = useMemo(
    () =>
      validation?.success ? collectTemplateWarnings(validation.automation) : [],
    [validation],
  )

  const stepErrors = useMemo(
    () => groupIssuesByIndex(validationErrors, "steps"),
    [validationErrors],
  )

  const triggerErrors = useMemo(
    () => groupIssuesByIndex(validationErrors, "triggers"),
    [validationErrors],
  )

  const generalErrors = useMemo(
    () =>
      validationErrors.filter(
        (issue) =>
          !EDITOR_INDEXED_COLLECTIONS.some((collection) =>
            new RegExp(`^${collection}\\.\\d+`).test(issue.path),
          ),
      ),
    [validationErrors],
  )

  const canSave =
    state !== null &&
    assembled !== null &&
    assembled.draft !== null &&
    assembled.issues.length === 0 &&
    validation?.success === true &&
    !saving

  const handleSave = async () => {
    if (!canSave || !validation?.success) {
      return
    }
    setSaving(true)
    setHostAccessWarning(null)
    try {
      if (automationTouchesPage(validation.automation.steps)) {
        try {
          const hostAccess =
            await sendRuntimeMessage<EnsureHostPermissionResponse>({
              type: "monocle-host-permission-ensure",
              reason: "automation",
            })
          if (!hostAccess.granted && hostAccess.originPattern) {
            setHostAccessWarning(
              hostAccess.error ??
                `Grant site access for ${hostAccess.originPattern} before running this automation on that site.`,
            )
          }
        } catch (error) {
          setHostAccessWarning(
            error instanceof Error
              ? error.message
              : "Could not request site access before saving.",
          )
        }
      }

      const action = isNew
        ? await dispatch(addAutomation({ automation: validation.automation }))
        : await dispatch(
            updateAutomation({
              id: automationId,
              automation: validation.automation,
            }),
          )
      if (
        addAutomation.fulfilled.match(action) ||
        updateAutomation.fulfilled.match(action)
      ) {
        navigate("/automations")
      }
    } finally {
      setSaving(false)
    }
  }

  if (!isNew && !script) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <Button asChild type="button" variant="ghost">
          <Link href="/automations">
            <ArrowLeft className="h-4 w-4" />
            Back to Automations
          </Link>
        </Button>
        <Panel className="p-8 text-center text-sm text-[var(--color-fg-muted)]">
          {loading ? "Loading automation…" : "Automation not found."}
        </Panel>
      </div>
    )
  }

  if (!state || !assembled) {
    return null
  }

  const running = automationId ? runningIds.includes(automationId) : false
  const runResult =
    automationId && lastRunResult?.id === automationId
      ? lastRunResult.result
      : null

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Button asChild size="icon" type="button" variant="ghost">
            <Link aria-label="Back to Automations" href="/automations">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold">
            {isNew ? "New Automation" : "Edit Automation"}
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isNew && (
            <Button
              disabled={running}
              type="button"
              variant="secondary"
              onClick={() => {
                if (automationId) {
                  void dispatch(runAutomation({ id: automationId }))
                }
              }}
            >
              <Play className="h-4 w-4" />
              {running ? "Running…" : "Test on Active Tab"}
            </Button>
          )}
          <Button disabled={!canSave} type="button" onClick={handleSave}>
            {saving ? "Saving…" : isNew ? "Create Automation" : "Save Changes"}
          </Button>
        </div>
      </header>

      {sliceError && (
        <div className="rounded-md border border-[var(--color-error-border)] bg-[var(--color-error-bg)] px-3 py-2 text-sm text-[var(--color-error-fg)]">
          {sliceError}
        </div>
      )}

      {hostAccessWarning && (
        <div className="rounded-md border border-[var(--color-warning-border)] bg-[var(--color-warning-bg)] px-3 py-2 text-sm text-[var(--color-warning-fg)]">
          {hostAccessWarning}
        </div>
      )}

      {!isNew && (
        <p className="text-xs text-[var(--color-fg-muted)]">
          Test runs execute the last saved version against the current active
          tab. Save your changes first to test them.
        </p>
      )}

      {runResult && (
        <Panel className="p-4">
          <h2 className="text-sm font-semibold">
            Test run: {runResult.success ? "succeeded" : "failed"}
          </h2>
          <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
            {runResult.completedSteps} step
            {runResult.completedSteps === 1 ? "" : "s"} completed
            {runResult.error ? ` — ${runResult.error}` : ""}
          </p>
          {runResult.stepOutcomes && runResult.stepOutcomes.length > 0 && (
            <ul className="mt-2 grid gap-1 text-xs">
              {runResult.stepOutcomes.map((outcome, index) => (
                <li
                  key={index}
                  className={
                    outcome.success
                      ? "text-[var(--color-fg-muted)]"
                      : "text-[var(--color-error-fg)]"
                  }
                >
                  {index + 1}. {outcome.op}
                  {outcome.id ? ` (${outcome.id})` : ""} —{" "}
                  {outcome.success ? "ok" : (outcome.error ?? "failed")}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <Section title="Details">
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--color-fg-muted)]">
            Name
          </span>
          <Input
            placeholder="Automation name"
            value={state.name}
            onChange={(event) =>
              setState({ ...state, name: event.target.value })
            }
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-xs font-medium text-[var(--color-fg-muted)]">
            Description
          </span>
          <Textarea
            placeholder="What does this automation do?"
            rows={2}
            value={state.description}
            onChange={(event) =>
              setState({ ...state, description: event.target.value })
            }
          />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--color-fg-muted)]">
              Icon
            </span>
            <Select
              value={state.icon}
              onChange={(event) =>
                setState({
                  ...state,
                  icon: event.target.value as IconName | "",
                })
              }
            >
              <option value="">None</option>
              {state.icon && !AUTOMATION_ICON_OPTIONS.includes(state.icon) && (
                <option value={state.icon}>{state.icon}</option>
              )}
              {AUTOMATION_ICON_OPTIONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--color-fg-muted)]">
              Color
            </span>
            <Select
              value={state.color}
              onChange={(event) =>
                setState({
                  ...state,
                  color: event.target.value as ColorName | "",
                })
              }
            >
              <option value="">Default</option>
              {AUTOMATION_COLOR_OPTIONS.map((color) => (
                <option key={color} value={color}>
                  {color}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex h-9 items-center gap-2 text-sm">
            <Checkbox
              checked={state.enabled}
              onCheckedChange={(checked) =>
                setState({ ...state, enabled: checked === true })
              }
            />
            Enabled
          </label>
        </div>
      </Section>

      <Section
        description="One URL pattern per row, e.g. https://github.com/*. An empty allow list means every page. Scope applies to both the palette row and automatic triggers — and automatic triggers only fire once you grant Monocle access to the host."
        title="Scope"
      >
        <div className="grid items-start gap-4 md:grid-cols-2">
          <div className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--color-fg-muted)]">
              Allow patterns
            </span>
            <ScopeRuleList
              placeholder="https://github.com/*"
              rows={state.allowRows}
              withPermissions
              onChange={(allowRows) => setState({ ...state, allowRows })}
            />
          </div>
          <div className="grid gap-1 text-sm">
            <span className="text-xs font-medium text-[var(--color-fg-muted)]">
              Deny patterns
            </span>
            <ScopeRuleList
              placeholder="https://example.com/admin/*"
              rows={state.denyRows}
              onChange={(denyRows) => setState({ ...state, denyRows })}
            />
          </div>
        </div>
      </Section>

      <Section
        description="When the automation runs. At most one of each automatic trigger type; manual triggers appear as palette commands."
        title="Triggers"
      >
        <TriggersEditor
          errorsByIndex={triggerErrors}
          rows={state.triggers}
          onChange={(triggers) => setState({ ...state, triggers })}
        />
      </Section>

      <Section
        description="Reference variables in step fields as {{name}}. Snippet variables resolve the snippet body at run time."
        title="Variables"
      >
        <VariablesEditor
          rows={state.vars}
          snippets={snippets}
          onChange={(vars) => setState({ ...state, vars })}
        />
      </Section>

      <Section
        description="Steps run top to bottom. Branches and loops are edited as JSON."
        title="Steps"
      >
        <div className="grid gap-3">
          {state.steps.map((row, index) => (
            <StepRow
              key={index}
              errors={stepErrors[index] ?? []}
              index={index}
              isFirst={index === 0}
              isLast={index === state.steps.length - 1}
              row={row}
              snippets={snippets}
              onChange={(next) => {
                const steps = [...state.steps]
                steps[index] = next
                setState({ ...state, steps })
              }}
              onDelete={() =>
                setState({
                  ...state,
                  steps: state.steps.filter((_, i) => i !== index),
                })
              }
              onMoveDown={() => {
                if (index >= state.steps.length - 1) {
                  return
                }
                const steps = [...state.steps]
                ;[steps[index], steps[index + 1]] = [
                  steps[index + 1],
                  steps[index],
                ]
                setState({ ...state, steps })
              }}
              onMoveUp={() => {
                if (index === 0) {
                  return
                }
                const steps = [...state.steps]
                ;[steps[index - 1], steps[index]] = [
                  steps[index],
                  steps[index - 1],
                ]
                setState({ ...state, steps })
              }}
            />
          ))}
          <div className="flex items-center gap-2">
            <Select
              aria-label="Step type to add"
              value={addOp}
              onChange={(event) =>
                setAddOp(event.target.value as AutomationStep["op"])
              }
            >
              {STEP_OP_OPTIONS.map((option) => (
                <option key={option.op} value={option.op}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              onClick={() =>
                setState({
                  ...state,
                  steps: [...state.steps, createDefaultStepRow(addOp)],
                })
              }
            >
              <Plus className="h-4 w-4" />
              Add Step
            </Button>
          </div>
        </div>
      </Section>

      {(assembled.issues.length > 0 || generalErrors.length > 0) && (
        <Panel className="border-[var(--color-error-border)] p-4">
          <h2 className="text-sm font-semibold text-[var(--color-error-fg)]">
            Fix before saving
          </h2>
          <ul className="mt-2 grid gap-1 text-xs text-[var(--color-error-fg)]">
            {assembled.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
            {generalErrors.map((issue) => (
              <li key={`${issue.path}:${issue.message}`}>
                {issue.path ? `${issue.path}: ` : ""}
                {issue.message}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {warnings.length > 0 && (
        <Panel className="p-4">
          <h2 className="text-sm font-semibold">Warnings</h2>
          <ul className="mt-2 grid gap-1 text-xs text-[var(--color-fg-muted)]">
            {warnings.map((name) => (
              <li key={name}>
                {`{{${name}}} is not a declared variable, loop binding, or known namespace — it will expand to an empty string.`}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  )
}
