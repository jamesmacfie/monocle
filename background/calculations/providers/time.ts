import type { CalculationProvider } from "../types"

// Lazily build a lookup from a place name to its IANA time zone, keyed by the
// last path segment of every zone Intl knows about ("Pacific/Auckland" ->
// "auckland", "America/New_York" -> "new york"). Computed once.
let zoneIndex: Map<string, string> | null = null

const getZoneIndex = (): Map<string, string> | null => {
  if (zoneIndex) {
    return zoneIndex
  }
  const supported = (
    Intl as unknown as {
      supportedValuesOf?: (key: string) => string[]
    }
  ).supportedValuesOf
  if (typeof supported !== "function") {
    return null
  }
  const index = new Map<string, string>()
  for (const zone of supported("timeZone")) {
    const segment = zone.split("/").pop()
    if (!segment) {
      continue
    }
    index.set(segment.replace(/_/g, " ").toLowerCase(), zone)
  }
  zoneIndex = index
  return index
}

// Pretty display label from a zone: "Pacific/Auckland" -> "Auckland",
// "America/New_York" -> "New York".
const labelForZone = (zone: string): string =>
  (zone.split("/").pop() ?? zone).replace(/_/g, " ")

export const timeProvider: CalculationProvider = {
  id: "time",
  name: "Time",
  priority: 80,
  parse(query) {
    const match = query.trim().match(/^time\s+in\s+(.+)$/i)
    if (!match) {
      return null
    }

    const index = getZoneIndex()
    if (!index) {
      return null
    }

    const place = match[1].trim().toLowerCase()
    const zone = index.get(place)
    if (!zone) {
      return null
    }

    let formatted: string
    try {
      formatted = new Intl.DateTimeFormat(undefined, {
        timeZone: zone,
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date())
    } catch {
      return null
    }

    return {
      content: [
        {
          type: "keyValue",
          rows: [{ label: labelForZone(zone), value: formatted }],
        },
      ],
      copyValue: formatted,
      icon: { type: "lucide", name: "Clock" },
    }
  },
}
