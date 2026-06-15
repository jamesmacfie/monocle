// Architecture: background command system, usage ranking. Per-command usage
// stats (frequency, recency, time-of-day histogram, smoothed EMA) persisted to
// monocle-commandUsage, used to order the root suggestion strip and as a
// search tie-breaker. The composite score deliberately blends three signals so
// no single one dominates: log frequency (so a runaway count can't pin a
// command at the top), exponential recency decay (7-day half-life), and a
// modest time-of-day boost (commands used around this hour rank higher). An EMA
// smooths the score across runs so a single odd use doesn't whipsaw ranking.
// searchIndex.ts caches the derived rank map behind its own TTL; this module
// just owns the stats and the math. See docs/search-and-ranking.md.
import { createStorageArea } from "../utils/storageArea"

interface CommandUsageStats {
  commandId: string
  totalUsage: number
  lastUsed: number
  hourlyUsage: number[] // 24-element array for each hour
  emaScore: number // exponential moving average
  parentNames?: string[] // Optional parent context for nested commands (e.g., ["Development", "Bookmarks"])
}

interface StoredUsageData {
  commandStats: Record<string, CommandUsageStats>
  lastCleanup: number
}

const USAGE_STORAGE_KEY = "monocle-commandUsage"
const CLEANUP_INTERVAL_DAYS = 90 // Clean up data older than 90 days
const EMA_SMOOTHING_FACTOR = 0.2 // Alpha for exponential moving average
const RECENCY_DECAY_RATE = 0.099 // Half-life of 7 days: ln(2)/7
const TIME_BOOST_FACTOR = 0.5 // Maximum boost factor for time-of-day similarity

const usageArea = createStorageArea<StoredUsageData>({
  key: USAGE_STORAGE_KEY,
  defaults: () => ({ commandStats: {}, lastCleanup: Date.now() }),
  label: "command usage",
})

const loadUsageData = (): Promise<StoredUsageData> => usageArea.load()

// Initialize empty stats for a command
const createEmptyStats = (commandId: string): CommandUsageStats => {
  return {
    commandId,
    totalUsage: 0,
    lastUsed: 0,
    hourlyUsage: new Array(24).fill(0),
    emaScore: 0,
  }
}

// Multiplier in [1, 1 + TIME_BOOST_FACTOR] favoring commands historically used
// around the current hour. Sums the share of usage in a ±2-hour window with
// linear distance decay, so "the command I open every morning" surfaces in the
// morning. Neutral (1) when the command has no time history yet.
const calculateTimeBoost = (
  hourlyUsage: number[],
  currentHour: number,
): number => {
  let timeScore = 0
  const totalHourlyUsage = hourlyUsage.reduce((sum, count) => sum + count, 0)

  // If no historical data, return neutral boost
  if (totalHourlyUsage === 0) {
    return 1
  }

  // Give boost for commands used at similar times (±2 hours with decay)
  for (let i = -2; i <= 2; i++) {
    const hour = (currentHour + i + 24) % 24
    const usageAtHour = hourlyUsage[hour]
    const distanceDecay = 1 - Math.abs(i) * 0.2 // Decay by distance from current hour
    timeScore += (usageAtHour / totalHourlyUsage) * distanceDecay
  }

  // Normalize and apply boost factor
  return 1 + timeScore * TIME_BOOST_FACTOR
}

// Composite ranking score: log(frequency) * recency-decay * time-boost, then
// folded into the stored EMA for cross-run smoothing. The EMA seeds from the
// first score rather than 0 so a brand-new command isn't penalized by a cold
// start. Returns the new EMA value, which recordCommandUsageUnlocked persists.
export const calculateCommandScore = (
  stats: CommandUsageStats,
  currentHour: number,
): number => {
  if (stats.totalUsage === 0) {
    return 0
  }

  // 1. Base frequency score (logarithmic to prevent dominance)
  const frequencyScore = Math.log(stats.totalUsage + 1)

  // 2. Recency decay (exponential decay with 7-day half-life)
  const daysSinceLastUse = (Date.now() - stats.lastUsed) / (1000 * 60 * 60 * 24)
  const recencyScore = Math.exp(-RECENCY_DECAY_RATE * daysSinceLastUse)

  // 3. Time-of-day boost
  const timeBoost = calculateTimeBoost(stats.hourlyUsage, currentHour)

  // 4. Combine with EMA for smoothing
  const currentScore = frequencyScore * recencyScore * timeBoost
  // Initialize EMA to current score for new commands to avoid cold start penalty
  const newEmaScore =
    stats.emaScore === 0
      ? currentScore
      : EMA_SMOOTHING_FACTOR * currentScore +
        (1 - EMA_SMOOTHING_FACTOR) * stats.emaScore

  return newEmaScore
}

// Record a command usage event. The locked update serializes concurrent
// executions (e.g. the same keybinding fired in two tabs) that would otherwise
// interleave between load and save and drop an increment. The mutator
// increments frequency, stamps recency and the current-hour histogram bucket,
// recomputes the EMA, and opportunistically prunes data older than the cleanup
// interval.
export const recordCommandUsage = async (
  commandId: string,
  parentNames?: string[],
): Promise<void> => {
  await usageArea.update((usageData) => {
    const now = Date.now()
    const currentHour = new Date(now).getHours()

    // Get or create stats for this command
    const stats =
      usageData.commandStats[commandId] || createEmptyStats(commandId)

    // Update stats
    stats.totalUsage += 1
    stats.lastUsed = now
    stats.hourlyUsage[currentHour] += 1

    // Store parent context if provided (for nested commands)
    if (parentNames && parentNames.length > 0) {
      stats.parentNames = parentNames
    }

    // Update EMA score
    stats.emaScore = calculateCommandScore(stats, currentHour)

    // Save updated stats
    usageData.commandStats[commandId] = stats

    // Check if we need to clean up old data
    if (shouldCleanupData(usageData.lastCleanup)) {
      cleanupOldData(usageData)
      usageData.lastCleanup = now
    }

    return usageData
  })
}

// Get usage stats for a command
export const getCommandUsageStats = async (
  commandId: string,
): Promise<CommandUsageStats> => {
  const usageData = await loadUsageData()
  return usageData.commandStats[commandId] || createEmptyStats(commandId)
}

// Get all command usage stats
export const getAllUsageStats = async (): Promise<
  Record<string, CommandUsageStats>
> => {
  const usageData = await loadUsageData()
  return usageData.commandStats
}

// Calculate scores for all commands and return sorted by score
export const getRankedCommandIds = async (): Promise<string[]> => {
  const currentHour = new Date().getHours()
  const usageData = await loadUsageData()

  const scoredCommands = Object.values(usageData.commandStats)
    .filter((stats) => stats.totalUsage > 0) // Include all commands that have been used
    .map((stats) => ({
      commandId: stats.commandId,
      score: calculateCommandScore(stats, currentHour),
    }))
    .sort((a, b) => b.score - a.score) // Sort by score descending
    .map((item) => item.commandId)

  return scoredCommands
}

// Check if we should clean up old data
const shouldCleanupData = (lastCleanup: number): boolean => {
  const daysSinceCleanup = (Date.now() - lastCleanup) / (1000 * 60 * 60 * 24)
  return daysSinceCleanup >= CLEANUP_INTERVAL_DAYS
}

// Clean up very old usage data to prevent storage bloat. Mutates in place; the
// caller persists the result via the usage area's locked update.
const cleanupOldData = (usageData: StoredUsageData): void => {
  const cutoffTime = Date.now() - CLEANUP_INTERVAL_DAYS * 24 * 60 * 60 * 1000

  // Remove commands that haven't been used in the cleanup interval
  Object.keys(usageData.commandStats).forEach((commandId) => {
    const stats = usageData.commandStats[commandId]
    if (stats.lastUsed < cutoffTime) {
      delete usageData.commandStats[commandId]
    }
  })
}
