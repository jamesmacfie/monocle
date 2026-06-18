// Architecture: background feature layer (Native Messaging bridge). The single
// place the internal Suggestion shape meets the public wire contract
// (ExternalSuggestion). Internal palette changes are absorbed here rather than
// breaking the external app. Pure and unit-tested. See
// docs/native-messaging/protocol.md.
import type {
  CommandIcon,
  ExternalSuggestion,
  Suggestion,
} from "../../../shared/types"

type ExternalSuggestionIcon = Pick<ExternalSuggestion, "icon" | "iconType">

// Suggestion types that exist on the wire. `input` rows are inline form fields
// with no meaning to a read-only external client, so they are dropped.
const WIRE_TYPES = new Set<ExternalSuggestion["type"]>([
  "action",
  "submit",
  "group",
  "search",
  "display",
  "calculation",
])

// A breadcrumb name array is joined with this separator into a single title.
const TITLE_SEPARATOR = " › "

const normalizeIcon = (icon?: CommandIcon): ExternalSuggestionIcon => {
  if (!icon) {
    return {}
  }
  if (icon.type === "lucide") {
    return { icon: icon.name, iconType: "lucide" }
  }
  if (icon.type === "url") {
    return { icon: icon.url, iconType: "url" }
  }
  // `svg` icons are inline markup — too large/opaque for the wire. Omitted.
  return {}
}

// Maps one internal Suggestion to the public DTO, or null when the suggestion
// type is not exposed on the wire (e.g. `input`).
export const toExternalSuggestion = (
  suggestion: Suggestion,
): ExternalSuggestion | null => {
  if (!WIRE_TYPES.has(suggestion.type as ExternalSuggestion["type"])) {
    return null
  }

  const title = Array.isArray(suggestion.name)
    ? suggestion.name.join(TITLE_SEPARATOR)
    : suggestion.name

  const external: ExternalSuggestion = {
    id: suggestion.id,
    type: suggestion.type as ExternalSuggestion["type"],
    title,
  }

  if (suggestion.description) {
    external.subtitle = suggestion.description
  }
  const icon = normalizeIcon(suggestion.icon)
  if (icon.icon) {
    external.icon = icon.icon
  }
  if (icon.iconType) {
    external.iconType = icon.iconType
  }
  if (suggestion.keywords && suggestion.keywords.length > 0) {
    external.keywords = suggestion.keywords
  }
  if (suggestion.permissions && suggestion.permissions.length > 0) {
    external.requiresPermission = [...suggestion.permissions]
  }

  return external
}

export const toExternalSuggestions = (
  suggestions: Suggestion[],
): ExternalSuggestion[] =>
  suggestions
    .map(toExternalSuggestion)
    .filter((s): s is ExternalSuggestion => s !== null)
