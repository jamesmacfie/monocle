/**
 * Runtime message validation utilities with security hardening
 */
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
import { createMessageHandler } from "./messages"
import { validateUrlPattern } from "./urlFilter"

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

// Rate limiting for message validation (prevent spam/abuse)
const validationRateLimit = new Map<
  string,
  { count: number; resetTime: number }
>()
const RATE_LIMIT_WINDOW = 60000 // 1 minute
const RATE_LIMIT_MAX = 1000 // max messages per minute per sender

// Message size limits (prevent memory exhaustion)
const MAX_MESSAGE_SIZE = 1024 * 1024 // 1MB
const MAX_STRING_LENGTH = 10000 // Max length for individual string fields

/**
 * Rate limiting check for message validation
 * @param senderId - Unique sender identifier
 * @returns true if rate limit exceeded
 */
function isRateLimited(senderId: string): boolean {
  const now = Date.now()
  const key = senderId || "unknown"

  const entry = validationRateLimit.get(key)
  if (!entry || now > entry.resetTime) {
    validationRateLimit.set(key, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    })
    return false
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return true
  }

  entry.count++
  return false
}

/**
 * Check message size to prevent memory exhaustion
 * @param message - Message to check
 * @returns true if message exceeds size limits
 */
function exceedsMessageLimits(message: unknown): boolean {
  try {
    const messageStr = JSON.stringify(message)
    if (messageStr.length > MAX_MESSAGE_SIZE) {
      return true
    }

    // Check individual string fields for excessive length
    if (typeof message === "object" && message !== null) {
      const checkStrings = (obj: any, depth = 0): boolean => {
        if (depth > 10) return false // Prevent deep recursion

        for (const value of Object.values(obj)) {
          if (typeof value === "string" && value.length > MAX_STRING_LENGTH) {
            return true
          }
          if (typeof value === "object" && value !== null) {
            if (checkStrings(value, depth + 1)) return true
          }
        }
        return false
      }

      return checkStrings(message)
    }

    return false
  } catch {
    return true // Treat serialization errors as size exceeded
  }
}

/**
 * Enhanced sender validation with additional security checks
 * @param sender - Message sender information
 * @param message - The message being validated
 * @returns Validation result with security context
 */
export function validateSender(
  sender: any,
  message: unknown,
): { valid: boolean; error?: string; senderId: string } {
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
  const senderValidation = validateSender(sender, rawMessage)
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
    case "execute-command":
    case "get-children-commands":
      if (!isValidCommandId(message.id)) {
        return { valid: false, error: "Invalid command ID format" }
      }
      break

    case "set-command-favorite":
      if (!isValidCommandId(message.commandId)) {
        return { valid: false, error: "Invalid command ID format" }
      }
      break

    case "execute-keybinding": {
      if (!isValidKeybinding(message.keybinding)) {
        return { valid: false, error: "Invalid keybinding format" }
      }
      break
    }

    case "update-command-setting": {
      if (!isValidCommandId(message.commandId)) {
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

      for (const [field, patterns] of Object.entries(message.value)) {
        if (patterns === undefined) {
          continue
        }

        if (!Array.isArray(patterns)) {
          return { valid: false, error: `${field} must be an array` }
        }

        for (const pattern of patterns) {
          const validation = validateUrlPattern(pattern)
          if (validation !== true) {
            return {
              valid: false,
              error: `Invalid ${field} pattern "${pattern}": ${validation}`,
            }
          }
        }
      }
      break
    }

    case "update-command-keybindings": {
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

    case "request-permission":
    case "open-permission-grant-page": {
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

/**
 * Creates a validated message handler that combines validation with error handling
 * @param handler - The message handler function that expects validated messages
 * @param handlerName - Name for logging/debugging
 * @returns Wrapped handler with validation and error handling
 */
export function createValidatedMessageHandler<T extends ValidatedMessage, R>(
  handler: (message: T, sender?: any) => Promise<R>,
  handlerName: string,
) {
  return createMessageHandler(async (rawMessage: unknown, sender?: any) => {
    const validation = validateIncomingMessage(rawMessage, sender)

    if (!validation.success) {
      // Log validation failures with context for security monitoring
      console.error(`[${handlerName}] Message validation failed:`, {
        error: validation.error,
        issues: validation.issues,
        sender: validation.senderId,
        messageType: (rawMessage as any)?.type || "unknown",
      })

      throw new Error(`Invalid message: ${validation.error}`)
    }

    return await handler(validation.data as T, sender)
  }, `${handlerName} validation error`)
}

/**
 * Cleans up rate limiting data (call periodically to prevent memory leaks)
 */
export function cleanupValidationData(): void {
  const now = Date.now()
  for (const [key, entry] of validationRateLimit.entries()) {
    if (now > entry.resetTime) {
      validationRateLimit.delete(key)
    }
  }
}

// Clean up validation data every 5 minutes
setInterval(cleanupValidationData, 5 * 60 * 1000)
