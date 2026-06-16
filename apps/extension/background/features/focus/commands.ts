// Architecture: background feature layer (Focus Mode). The palette surface: a
// state-aware Focus Mode group. Start/Stop labels reflect the live session via
// async name resolvers (the newTab/clock.ts toggle pattern); selecting keeps
// the palette open so the label flips in place. See docs/focus-mode.md.
import type { CommandNode, GroupCommandNode } from "../../../shared/types"
import { getFeatureConfig } from "../config"
import { createConfigureFeatureCommand } from "../configureCommand"
import {
  getSession,
  isSessionActive,
  remainingMs,
  startSession,
  stopSession,
} from "./session"
import { FOCUS_FEATURE_ID, focusConfigDefaults } from "./types"

const formatRemaining = (ms: number): string => {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

const startFocus: CommandNode = {
  type: "action",
  id: "focus-start",
  name: "Start Focus",
  description: "Block distracting sites until you stop",
  icon: { type: "lucide", name: "Play" },
  color: "purple",
  remainOpenOnSelect: true,
  execute: async () => {
    await startSession("indefinite")
  },
}

const startFocus30: CommandNode = {
  type: "action",
  id: "focus-start-30",
  name: "Start for 30 Minutes",
  description: "Focus session that ends automatically after 30 minutes",
  icon: { type: "lucide", name: "Timer" },
  color: "purple",
  remainOpenOnSelect: true,
  execute: async () => {
    await startSession("timed", 30)
  },
}

const startFocus60: CommandNode = {
  type: "action",
  id: "focus-start-60",
  name: "Start for 60 Minutes",
  description: "Focus session that ends automatically after 60 minutes",
  icon: { type: "lucide", name: "Timer" },
  color: "purple",
  remainOpenOnSelect: true,
  execute: async () => {
    await startSession("timed", 60)
  },
}

const startPomodoro: CommandNode = {
  type: "action",
  id: "focus-start-pomodoro",
  name: "Start Pomodoro",
  description: "Focus session for the configured default duration",
  icon: { type: "lucide", name: "Timer" },
  color: "purple",
  remainOpenOnSelect: true,
  // Pomodoro length is read from feature config at execute time so it always
  // reflects the latest "Default duration" setting.
  execute: async () => {
    const config = await getFeatureConfig(FOCUS_FEATURE_ID, focusConfigDefaults)
    await startSession("pomodoro", config.defaultDurationMinutes)
  },
}

const stopFocus: CommandNode = {
  type: "action",
  id: "focus-stop",
  name: async () => {
    const session = await getSession()
    const left = remainingMs(session, Date.now())
    return left !== null
      ? `Stop Focus (${formatRemaining(left)} left)`
      : "Stop Focus"
  },
  description: "End the current focus session",
  icon: { type: "lucide", name: "XCircle" },
  color: "red",
  remainOpenOnSelect: true,
  execute: async () => {
    await stopSession()
  },
}

export const focusModeGroup: GroupCommandNode = {
  type: "group",
  id: FOCUS_FEATURE_ID,
  name: "Focus Mode",
  description: "Block distracting sites during focus sessions",
  icon: { type: "lucide", name: "Shield" },
  color: "purple",
  keywords: ["focus", "block", "distraction", "pomodoro", "concentrate"],
  settingsCatalog: { includeChildren: true },
  children: async () => {
    const session = await getSession()
    const active = isSessionActive(session, Date.now())

    const children: CommandNode[] = []
    if (active) {
      children.push(stopFocus)
    } else {
      children.push(startFocus, startFocus30, startFocus60, startPomodoro)
    }
    children.push(createConfigureFeatureCommand(FOCUS_FEATURE_ID, "Focus Mode"))
    return children
  },
}
