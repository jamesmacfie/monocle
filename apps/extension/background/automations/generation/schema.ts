// OpenAI Structured Outputs schema for the lossless automation-generation IR.
// Every object is closed and all properties are required; nullable values mean
// "omit this canonical optional field". Dynamic maps use entry arrays and HTTP
// JSON uses tagged nodes, preserving an intentional JSON null.
import { COLOR_NAMES } from "../../../shared/types/automationValidation"
import { ICON_NAMES } from "../../../shared/types/icons"
import { HTTP_REQUEST_METHODS } from "../../../shared/utils/http-request-policy"

type JsonSchema = Record<string, unknown>

const ref = (name: string): JsonSchema => ({ $ref: `#/$defs/${name}` })
const nullable = (schema: JsonSchema): JsonSchema => ({
  anyOf: [schema, { type: "null" }],
})
const object = (
  properties: Record<string, JsonSchema>,
  description?: string,
): JsonSchema => ({
  type: "object",
  ...(description ? { description } : {}),
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})
const array = (items: JsonSchema): JsonSchema => ({ type: "array", items })
const string = (description?: string): JsonSchema => ({
  type: "string",
  ...(description ? { description } : {}),
})
const number = (description?: string): JsonSchema => ({
  type: "number",
  ...(description ? { description } : {}),
})
const integer = (description?: string): JsonSchema => ({
  type: "integer",
  ...(description ? { description } : {}),
})
const boolean = (description?: string): JsonSchema => ({
  type: "boolean",
  ...(description ? { description } : {}),
})
const valueType = (
  values: readonly (string | number | boolean)[],
): "string" | "integer" | "number" | "boolean" => {
  const first = values[0]
  if (typeof first === "string") return "string"
  if (typeof first === "boolean") return "boolean"
  return values.every((value) => Number.isInteger(value)) ? "integer" : "number"
}
const enumeration = (values: readonly (string | number)[]): JsonSchema => ({
  type: valueType(values),
  enum: [...values],
})
const variants = (...schemas: JsonSchema[]): JsonSchema => ({ anyOf: schemas })
const literal = (value: string | number | boolean): JsonSchema => ({
  type: valueType([value]),
  enum: [value],
})

const selector = variants(
  object({
    strategy: literal("css"),
    value: string("CSS selector; never interpolate."),
    index: nullable(integer("Zero-based match index.")),
  }),
  object({
    strategy: literal("text"),
    value: string("Visible text to match; never interpolate."),
    exact: nullable(boolean("False means substring matching.")),
    within: nullable(ref("selector")),
    index: nullable(integer("Zero-based match index.")),
  }),
)

const comparisonOperators = [
  "equals",
  "equalsIgnoreCase",
  "notEquals",
  "contains",
  "notContains",
  "startsWith",
  "endsWith",
  "greaterThan",
  "lessThan",
] as const

const condition = variants(
  object({ kind: literal("elementExists"), selector: ref("selector") }),
  object({ kind: literal("elementVisible"), selector: ref("selector") }),
  object({
    kind: literal("elementText"),
    selector: ref("selector"),
    operator: enumeration(comparisonOperators),
    value: string(),
  }),
  object({ kind: literal("urlIncludes"), value: string() }),
  object({
    kind: literal("varCompare"),
    name: string(),
    operator: enumeration(comparisonOperators),
    value: string(),
  }),
  object({ kind: literal("varMatches"), name: string(), pattern: string() }),
  object({ kind: literal("not"), of: ref("condition") }),
  object({ kind: literal("allOf"), of: array(ref("condition")) }),
  object({ kind: literal("anyOf"), of: array(ref("condition")) }),
)

const retry = object({
  retries: integer(),
  delayMs: nullable(integer()),
  backoff: nullable(enumeration(["none", "exponential"])),
})
const targeting = object({
  scrollIntoView: nullable(boolean()),
  ensureVisible: nullable(boolean()),
})
const contentBase = {
  id: nullable(string()),
  description: nullable(string()),
  timeoutMs: nullable(integer()),
  retry: nullable(retry),
  targeting: nullable(targeting),
}
const engineBase = {
  id: nullable(string()),
  description: nullable(string()),
}
const contentStep = (op: string, fields: Record<string, JsonSchema>) =>
  object({ op: literal(op), ...contentBase, ...fields })
const engineStep = (op: string, fields: Record<string, JsonSchema>) =>
  object({ op: literal(op), ...engineBase, ...fields })

const waitFor = variants(
  object({ timeMs: integer() }),
  object({
    selector: ref("selector"),
    state: nullable(enumeration(["attached", "visible", "hidden", "detached"])),
  }),
  object({ urlIncludes: string() }),
  object({ readyState: enumeration(["loading", "interactive", "complete"]) }),
)
const scrollTo = variants(
  enumeration(["top", "bottom", "center"]),
  object({ x: number(), y: number() }),
  object({ intoView: literal(true) }),
)

const surfaceUrlMatch = object({
  allowUrls: nullable(array(string())),
  denyUrls: nullable(array(string())),
})
const surfaceContent = object({
  icon: nullable(enumeration(ICON_NAMES)),
  title: nullable(string()),
  text: nullable(string()),
  countdownTo: nullable(integer()),
})
const surfaceAction = object({
  id: string(),
  label: string(),
  icon: nullable(enumeration(ICON_NAMES)),
  style: nullable(enumeration(["default", "primary", "danger"])),
  steps: array(ref("step")),
})

const jsonNode = variants(
  object({ type: literal("null") }),
  object({ type: literal("string"), value: string() }),
  object({ type: literal("number"), value: number() }),
  object({ type: literal("boolean"), value: boolean() }),
  object({ type: literal("array"), items: array(ref("jsonNode")) }),
  object({
    type: literal("object"),
    entries: array(object({ key: string(), value: ref("jsonNode") })),
  }),
)

const responseMapping = object({
  path: array(variants(string(), integer())),
  toVar: string(),
  required: nullable(boolean()),
})

const step = variants(
  contentStep("click", {
    target: ref("selector"),
    button: nullable(enumeration(["left", "middle", "right"])),
    clickCount: nullable(enumeration([1, 2])),
    delayMs: nullable(integer()),
    modifiers: nullable(
      array(enumeration(["Alt", "Control", "Meta", "Shift"])),
    ),
    expectNavigation: nullable(boolean()),
  }),
  contentStep("wait", { for: waitFor }),
  contentStep("hover", { target: ref("selector") }),
  contentStep("focus", { target: ref("selector") }),
  contentStep("blur", { target: ref("selector") }),
  contentStep("fill", {
    target: ref("selector"),
    text: string(),
    clear: nullable(enumeration(["none", "select-all", "backspace"])),
    fire: nullable(
      object({ input: nullable(boolean()), change: nullable(boolean()) }),
    ),
  }),
  contentStep("type", {
    target: ref("selector"),
    keys: array(string()),
    delayMs: nullable(integer()),
  }),
  contentStep("key", {
    keys: array(string()),
    delayMs: nullable(integer()),
  }),
  contentStep("select", {
    target: ref("selector"),
    by: object({
      value: nullable(string()),
      label: nullable(string()),
      index: nullable(integer()),
    }),
    fireChange: nullable(boolean()),
  }),
  contentStep("check", { target: ref("selector") }),
  contentStep("uncheck", { target: ref("selector") }),
  contentStep("submit", {
    target: ref("selector"),
    expectNavigation: nullable(boolean()),
  }),
  contentStep("scroll", {
    target: nullable(ref("selector")),
    to: scrollTo,
    behavior: nullable(enumeration(["auto", "smooth"])),
  }),
  contentStep("getText", {
    from: ref("selector"),
    attr: nullable(string()),
    toVar: string(),
  }),
  contentStep("removeElement", {
    target: ref("selector"),
    all: nullable(boolean()),
  }),
  contentStep("hideElement", {
    target: ref("selector"),
    all: nullable(boolean()),
    scopeKey: nullable(string()),
  }),
  contentStep("injectCss", { css: string(), scopeKey: nullable(string()) }),
  engineStep("setVariable", { name: string(), value: string() }),
  engineStep("insertSnippet", {
    snippetId: string(),
    target: nullable(ref("selector")),
  }),
  engineStep("toast", {
    level: nullable(enumeration(["info", "success", "error"])),
    message: string(),
  }),
  engineStep("navigate", { url: string() }),
  engineStep("openUrl", {
    url: string(),
    disposition: nullable(enumeration(["currentTab", "newTab", "newWindow"])),
  }),
  engineStep("clipboardWrite", { text: string() }),
  engineStep("runCommand", { commandId: string() }),
  engineStep("httpRequest", {
    method: enumeration(HTTP_REQUEST_METHODS),
    url: string(),
    headers: nullable(array(object({ name: string(), value: string() }))),
    body: nullable(ref("jsonNode")),
    timeoutMs: nullable(integer()),
    response: nullable(
      object({
        statusToVar: nullable(string()),
        json: nullable(array(responseMapping)),
      }),
    ),
  }),
  engineStep("showSurface", {
    surfaceId: string(),
    kind: enumeration(["overlay", "badge"]),
    urlMatch: nullable(surfaceUrlMatch),
    blocking: nullable(boolean()),
    content: surfaceContent,
  }),
  engineStep("showSurface", {
    surfaceId: string(),
    kind: literal("inline"),
    urlMatch: nullable(surfaceUrlMatch),
    placement: object({
      selector: string(),
      index: nullable(integer()),
      position: enumeration(["before", "prepend", "append", "after"]),
    }),
    content: surfaceContent,
    actions: array(surfaceAction),
  }),
  engineStep("hideSurface", { surfaceId: string() }),
  engineStep("branch", {
    if: ref("condition"),
    then: array(ref("step")),
    else: nullable(array(ref("step"))),
  }),
  engineStep("forEach", {
    over: variants(
      object({ elements: ref("selector") }),
      object({ variable: string() }),
    ),
    as: nullable(string()),
    maxIterations: nullable(integer()),
    steps: array(ref("step")),
  }),
  engineStep("while", {
    condition: ref("condition"),
    maxIterations: nullable(integer()),
    steps: array(ref("step")),
  }),
)

const parameter = object({
  id: string(),
  label: string(),
  required: nullable(boolean()),
  type: enumeration(["text", "textarea", "select"]),
  placeholder: nullable(string()),
  defaultValue: nullable(string()),
  options: nullable(array(object({ value: string(), label: string() }))),
})
const trigger = variants(
  object({ type: literal("manual"), parameters: nullable(array(parameter)) }),
  object({
    type: literal("urlMatch"),
    on: nullable(array(enumeration(["load", "spa"]))),
    oncePerPage: nullable(boolean()),
    delayMs: nullable(integer()),
    disarmed: boolean(),
  }),
  object({
    type: literal("elementAppears"),
    selector: ref("selector"),
    oncePerPage: nullable(boolean()),
    throttleMs: nullable(integer()),
    disarmed: boolean(),
  }),
  object({
    type: literal("interval"),
    everyMinutes: integer(),
    disarmed: boolean(),
  }),
  object({ type: literal("schedule"), at: string(), disarmed: boolean() }),
  object({ type: literal("onStartup"), disarmed: boolean() }),
)

const variableDefinition = variants(
  object({ kind: literal("literal"), value: string() }),
  object({ kind: literal("snippet"), snippetId: string() }),
  object({ kind: literal("runtime") }),
)

export const AUTOMATION_GENERATION_JSON_SCHEMA: JsonSchema = {
  ...object({
    note: string(
      "Concise assumptions, selector uncertainty, or review guidance; empty when none.",
    ),
    script: object({
      schemaVersion: literal(1),
      name: string(),
      description: nullable(string()),
      icon: nullable(enumeration(ICON_NAMES)),
      color: nullable(enumeration(COLOR_NAMES)),
      enabled: boolean(),
      urlRules: nullable(
        object({ allowUrls: array(string()), denyUrls: array(string()) }),
      ),
      triggers: array(ref("trigger")),
      variables: array(
        object({ name: string(), definition: variableDefinition }),
      ),
      steps: array(ref("step")),
      showResultToast: nullable(boolean()),
    }),
  }),
  $defs: { selector, condition, jsonNode, step, trigger },
}
