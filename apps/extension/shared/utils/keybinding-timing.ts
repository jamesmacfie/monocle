// Authoritative chord window: how long the background waits for the next
// stroke of a multi-stroke sequence before executing a pending single match
// or resetting sequence state.
export const CHORD_TIMEOUT_MS = 800

// The UI's local sequence buffer exists only to preemptively suppress the
// next stroke's browser default. Its idle timer starts after the
// execute-keybinding round-trip resolves, so it must strictly outlive the
// background chord timer; otherwise the UI would stop suppressing while the
// background still has an active sequence.
export const UI_SEQUENCE_IDLE_TIMEOUT_MS = CHORD_TIMEOUT_MS + 100
