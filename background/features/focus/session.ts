// Architecture: background feature layer (Focus Mode). Owns the runtime focus
// session in monocle-feature-state. The session is timestamp-based: "active" is
// computed from endsAt, so no per-second background work is needed. A single
// chrome.alarms alarm fires at endsAt to clear the session; init re-arms it
// after a SW restart. Session changes are reflected purely by pushing/clearing
// surfaces in the generic Surfaces store — there is no focus-specific message
// or event. See docs/focus-mode.md and docs/surfaces.md.
import { getBrowserAPI } from "../../../shared/utils/extension-api"
import { clearOwnerSurfaces, setOwnerSurfaces } from "../../surfaces"
import { getFeatureConfig } from "../config"
import { clearFeatureState, getFeatureState, setFeatureState } from "../state"
import { projectFocusSurfaces } from "./surfaces"
import {
  FOCUS_FEATURE_ID,
  type FocusSession,
  type FocusSessionMode,
  type FocusState,
  focusConfigDefaults,
} from "./types"

const END_ALARM_NAME = `feature:${FOCUS_FEATURE_ID}:end`

export const getSession = async (): Promise<FocusSession | null> => {
  const state = await getFeatureState<FocusState>(FOCUS_FEATURE_ID)
  return state?.session ?? null
}

export const isSessionActive = (
  session: FocusSession | null,
  now: number,
): boolean => {
  if (!session) {
    return false
  }
  return session.endsAt === undefined || session.endsAt > now
}

export const remainingMs = (
  session: FocusSession | null,
  now: number,
): number | null => {
  if (!session || session.endsAt === undefined) {
    return null
  }
  return Math.max(0, session.endsAt - now)
}

// Reflects the current session into the generic surfaces store: push the focus
// overlay + badge while active, clear them otherwise. Reused by start/stop, the
// end alarm, config changes, and startup. The only place focus touches UI.
export const syncFocusSurfaces = async (
  session: FocusSession | null,
): Promise<void> => {
  if (!session) {
    await clearOwnerSurfaces(FOCUS_FEATURE_ID)
    return
  }
  const config = await getFeatureConfig(FOCUS_FEATURE_ID, focusConfigDefaults)
  await setOwnerSurfaces(
    FOCUS_FEATURE_ID,
    projectFocusSurfaces(session, config),
  )
}

const armEndAlarm = (endsAt: number): void => {
  getBrowserAPI().alarms?.create(END_ALARM_NAME, { when: endsAt })
}

const clearEndAlarm = async (): Promise<void> => {
  await getBrowserAPI().alarms?.clear(END_ALARM_NAME)
}

export const startSession = async (
  mode: FocusSessionMode,
  durationMinutes?: number,
): Promise<FocusSession> => {
  const now = Date.now()
  const session: FocusSession = { startedAt: now, mode }

  if (mode !== "indefinite") {
    const minutes = durationMinutes && durationMinutes > 0 ? durationMinutes : 0
    session.endsAt = now + minutes * 60_000
    armEndAlarm(session.endsAt)
  } else {
    await clearEndAlarm()
  }

  await setFeatureState<FocusState>(FOCUS_FEATURE_ID, { session })
  await syncFocusSurfaces(session)
  return session
}

export const stopSession = async (): Promise<void> => {
  await clearEndAlarm()
  await clearFeatureState(FOCUS_FEATURE_ID)
  await syncFocusSurfaces(null)
}

// Fired by the end alarm. Clears the session if it has actually expired and
// drops its surfaces. No-op if the user already stopped.
const handleEndAlarm = async (): Promise<void> => {
  const session = await getSession()
  if (!session) {
    return
  }
  if (!isSessionActive(session, Date.now())) {
    await clearFeatureState(FOCUS_FEATURE_ID)
    await syncFocusSurfaces(null)
  }
}

// Startup lifecycle: wire the alarm listener and reconcile surfaces with the
// persisted session after a service-worker restart (re-arm a pending timed
// session, or clear an already-expired one).
export const initFocusSession = async (): Promise<void> => {
  const alarms = getBrowserAPI().alarms
  alarms?.onAlarm?.addListener((alarm: { name: string }) => {
    if (alarm.name === END_ALARM_NAME) {
      handleEndAlarm().catch((error) =>
        console.error("[focus] end-alarm handling failed:", error),
      )
    }
  })

  const session = await getSession()
  if (!isSessionActive(session, Date.now())) {
    // No session, or it expired while the worker was dead.
    if (session) {
      await clearFeatureState(FOCUS_FEATURE_ID)
    }
    await syncFocusSurfaces(null)
    return
  }

  if (session?.endsAt !== undefined) {
    armEndAlarm(session.endsAt)
  }
  await syncFocusSurfaces(session)
}
