// Architecture: background message validation orchestrator. Applies transport
// rate/size guards, the shared Zod wire schema, then message-specific business
// invariants before the exhaustive router dispatches.
import {
  BROWSER_PERMISSIONS,
  type ValidatedMessage,
  type ValidationResult,
  validateMessage,
} from "../../shared/types"
import {
  isValidKeybinding,
  normalizeKeybinding,
} from "../../shared/utils/key-normalizer"
import { isRateLimited } from "./rateLimit"
import { exceedsMessageLimits } from "./sizeGuards"
import { validateUrlRulesValue } from "./urlFilter"

// Command ids are internal lookup keys (never interpolated into a DOM/eval/query
// sink), so the charset is an injection guard, not an escaping mechanism. Beyond
// the safe ASCII set, ids may embed browser add-on identifiers: Chrome uses 32
// lowercase letters, but Firefox add-on ids are email-style ("addon@mozilla.org")
// or GUID-style ("{e4a8...}") — hence `@`, `{`, and `}` are allowed. Used for
// every command-id-bearing message (execute-command, get-children-commands,
// set-command-favorite, update-command-setting, update-command-keybindings).
const COMMAND_ID_PATTERN = /^[a-zA-Z0-9\-._:@{}]+$/
const COMMAND_ID_MAX_LENGTH = 200

const isValidCommandId = (id: string): boolean =>
  id.length > 0 &&
  id.length <= COMMAND_ID_MAX_LENGTH &&
  COMMAND_ID_PATTERN.test(id)

const validateTransport = (
  sender: any,
  message: unknown,
): { valid: boolean; error?: string; senderId: string } => {
  const senderId = sender?.id || sender?.url || "unknown"

  // Rate limiting check
  if (isRateLimited(senderId)) {
    console.warn("[Security] Rate limit exceeded for sender:", senderId)
    return { valid: false, error: "Rate limit exceeded", senderId }
  }

  // Message size check
  if (exceedsMessageLimits(message)) {
    console.warn(
      "[Security] Message size limit exceeded from sender:",
      senderId,
    )
    return { valid: false, error: "Message too large", senderId }
  }

  return { valid: true, senderId }
}

/**
 * Comprehensive message validation with security hardening
 * @param rawMessage - Raw message from sender
 * @param sender - Sender information
 * @returns Validation result with validated message or error details
 */
export function validateIncomingMessage(
  rawMessage: unknown,
  sender: any,
): ValidationResult<ValidatedMessage> & { senderId?: string } {
  // First validate sender and basic security constraints
  const senderValidation = validateTransport(sender, rawMessage)
  if (!senderValidation.valid) {
    return {
      success: false,
      error: senderValidation.error || "Sender validation failed",
      issues: [],
      senderId: senderValidation.senderId,
    }
  }

  // Then validate message schema
  const messageValidation = validateMessage(rawMessage)
  if (!messageValidation.success) {
    console.warn("[Validation] Message validation failed:", {
      error: messageValidation.error,
      issues: messageValidation.issues,
      sender: senderValidation.senderId,
      messageType: (rawMessage as any)?.type || "unknown",
    })

    return {
      ...messageValidation,
      senderId: senderValidation.senderId,
    }
  }

  // Additional business logic validation
  const businessValidation = validateBusinessLogic(messageValidation.data)
  if (!businessValidation.valid) {
    console.warn("[Validation] Business logic validation failed:", {
      error: businessValidation.error,
      sender: senderValidation.senderId,
      messageType: messageValidation.data.type,
    })

    return {
      success: false,
      error: businessValidation.error || "Business logic validation failed",
      issues: [],
      senderId: senderValidation.senderId,
    }
  }

  return {
    success: true,
    data: messageValidation.data,
    senderId: senderValidation.senderId,
  }
}

/**
 * Per-message-type semantic checks layered on top of schema validation. Schema
 * validation proves a message is structurally well-formed; this switch enforces
 * the value-level invariants the schema can't express — command ids match the
 * safe id charset/length (injection guard), keybindings are already canonical
 * (no silent re-normalization at the boundary), batch keybinding updates have no
 * duplicate target ids, url-rule patterns each pass validateUrlPattern, and
 * permission names are members of BROWSER_PERMISSIONS. Message types not listed
 * here need no extra checks and pass through. Returns valid:false with a
 * human-readable error on the first violation.
 * @param message - Validated message
 * @returns Business validation result
 */
function validateBusinessLogic(message: ValidatedMessage): {
  valid: boolean
  error?: string
} {
  switch (message.type) {
    case "monocle-command-execute":
    case "monocle-command-children-get":
      if (!isValidCommandId(message.id)) {
        return { valid: false, error: "Invalid command ID format" }
      }
      break

    case "monocle-command-favorite-set":
      if (!isValidCommandId(message.id)) {
        return { valid: false, error: "Invalid command ID format" }
      }
      break

    case "monocle-keybinding-execute": {
      if (!isValidKeybinding(message.keybinding)) {
        return { valid: false, error: "Invalid keybinding format" }
      }
      break
    }

    case "monocle-command-setting-update": {
      if (!isValidCommandId(message.id)) {
        return { valid: false, error: "Invalid command ID format" }
      }

      if (message.setting === "keybinding") {
        if (
          message.value === undefined ||
          message.value === null ||
          message.value === ""
        ) {
          break
        }

        const normalizedKeybinding = normalizeKeybinding(message.value)
        if (!normalizedKeybinding || normalizedKeybinding !== message.value) {
          return {
            valid: false,
            error: "Keybinding setting must be canonical keybinding text",
          }
        }
        break
      }

      if (message.setting === "hidden") {
        break
      }

      const urlRulesValidation = validateUrlRulesValue(message.value)
      if (!urlRulesValidation.valid) {
        return urlRulesValidation
      }
      break
    }

    case "monocle-command-keybindings-update": {
      const seenCommandIds = new Set<string>()

      for (const update of message.updates) {
        if (!isValidCommandId(update.commandId)) {
          return { valid: false, error: "Invalid command ID format" }
        }

        if (seenCommandIds.has(update.commandId)) {
          return { valid: false, error: "Duplicate command keybinding update" }
        }
        seenCommandIds.add(update.commandId)

        if (
          update.keybinding === undefined ||
          update.keybinding === null ||
          update.keybinding === ""
        ) {
          continue
        }

        const normalizedKeybinding = normalizeKeybinding(update.keybinding)
        if (
          !normalizedKeybinding ||
          normalizedKeybinding !== update.keybinding
        ) {
          return {
            valid: false,
            error: "Keybinding setting must be canonical keybinding text",
          }
        }
      }

      break
    }

    case "monocle-permission-request":
    case "monocle-permission-grant-page-open": {
      // Validate permission name against the single source of truth
      // (BROWSER_PERMISSIONS in shared/types/commands.ts).
      if (
        !(BROWSER_PERMISSIONS as readonly string[]).includes(message.permission)
      ) {
        return { valid: false, error: "Invalid permission name" }
      }
      break
    }
  }

  return { valid: true }
}
