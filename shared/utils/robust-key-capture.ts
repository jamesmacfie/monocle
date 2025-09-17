/**
 * Provides reliable event interception with redundancy and strong suppression
 */

import {
  getActualEventTarget,
  isEditableElement,
  shouldProcessKeybinding,
} from "./event-filter"
import { getKeyString } from "./key-normalizer"

export type KeyHandler = (
  keyString: string,
  event: KeyboardEvent,
) => boolean | Promise<boolean>

export interface RobustKeyCaptureOptions {
  /** Handler function for captured key events */
  onKeyPress?: KeyHandler
  /** Whether to enable debug logging */
  debug?: boolean
}

export class RobustKeyCapture {
  private listeners: Array<{
    target: EventTarget
    type: string
    handler: EventListener
    options?: boolean | AddEventListenerOptions
  }> = []
  private options: RobustKeyCaptureOptions
  private isInstalled = false

  constructor(options: RobustKeyCaptureOptions = {}) {
    this.options = options
  }

  /**
   * Install multi-level event listeners for robust capture
   */
  install(): void {
    if (this.isInstalled) {
      this.log("Already installed, skipping")
      return
    }

    // Install at multiple DOM levels for redundancy
    // Window level first - highest priority
    this.addCaptureListener(window, "keydown", this.handleKeydown.bind(this))

    // Document level for backup
    this.addCaptureListener(document, "keydown", this.handleKeydown.bind(this))

    this.isInstalled = true
    this.log("Robust key capture installed")
  }

  /**
   * Remove all event listeners
   */
  uninstall(): void {
    if (!this.isInstalled) {
      return
    }

    for (const { target, type, handler, options } of this.listeners) {
      target.removeEventListener(type, handler, options)
    }

    this.listeners = []
    this.isInstalled = false
    this.log("Robust key capture uninstalled")
  }

  /**
   * Update the key handler
   */
  setKeyHandler(handler: KeyHandler): void {
    this.options.onKeyPress = handler
  }

  /**
   * Add a capture-phase event listener with tracking
   */
  private addCaptureListener(
    target: EventTarget,
    type: string,
    handler: EventListener,
  ): void {
    // Use capture phase for earlier interception
    const options: AddEventListenerOptions = {
      capture: true,
      passive: false, // Ensure we can preventDefault
    }

    target.addEventListener(type, handler, options)

    // Track for cleanup
    this.listeners.push({ target, type, handler, options })
  }

  /**
   * Main keydown handler with robust processing
   */
  private handleKeydown = (event: Event): void => {
    const keyboardEvent = event as KeyboardEvent
    try {
      // Get the actual target for better debugging
      const actualTarget = getActualEventTarget(keyboardEvent)

      this.log(
        "Keydown event:",
        keyboardEvent.key,
        "modifiers:",
        {
          ctrl: keyboardEvent.ctrlKey,
          meta: keyboardEvent.metaKey,
          alt: keyboardEvent.altKey,
          shift: keyboardEvent.shiftKey,
        },
        "target:",
        keyboardEvent.target,
        "actualTarget:",
        actualTarget,
        "isEditable:",
        actualTarget ? isEditableElement(actualTarget) : false,
      )

      // Early filtering - should we process this event?
      if (!shouldProcessKeybinding(keyboardEvent)) {
        this.log("Event filtered out by shouldProcessKeybinding")
        return
      }

      // Convert to canonical key string
      const keyString = getKeyString(keyboardEvent)
      if (!keyString) {
        this.log("No key string generated")
        return
      }

      this.log("Generated key string:", keyString)

      // Call the handler if available
      if (this.options.onKeyPress) {
        const handled = this.options.onKeyPress(keyString, keyboardEvent)

        if (handled) {
          this.log("Key handled, suppressing event")
          this.suppressEvent(keyboardEvent)
        } else {
          this.log("Key not handled, allowing event")
        }
      }
    } catch (error) {
      console.error("[RobustKeyCapture] Error in keydown handler:", error)
    }
  }

  /**
   * Strong event suppression using stopImmediatePropagation
   */
  private suppressEvent(event: KeyboardEvent): void {
    try {
      // Prevent default browser behavior
      event.preventDefault()

      // Stop immediate propagation - stronger than stopPropagation
      event.stopImmediatePropagation()

      this.log("Event suppressed with stopImmediatePropagation")
    } catch (error) {
      console.error("[RobustKeyCapture] Error suppressing event:", error)
    }
  }

  /**
   * Debug logging
   */
  private log(...args: unknown[]): void {
    if (this.options.debug) {
      console.log("[RobustKeyCapture]", ...args)
    }
  }

  /**
   * Get current installation status
   */
  get installed(): boolean {
    return this.isInstalled
  }

  /**
   * Get listener count for debugging
   */
  get listenerCount(): number {
    return this.listeners.length
  }
}

/**
 * Singleton instance for global use
 */
class GlobalRobustKeyCapture extends RobustKeyCapture {
  private static instance: GlobalRobustKeyCapture | null = null

  static getInstance(): GlobalRobustKeyCapture {
    if (!GlobalRobustKeyCapture.instance) {
      GlobalRobustKeyCapture.instance = new GlobalRobustKeyCapture()
    }
    return GlobalRobustKeyCapture.instance
  }

  static resetInstance(): void {
    if (GlobalRobustKeyCapture.instance) {
      GlobalRobustKeyCapture.instance.uninstall()
      GlobalRobustKeyCapture.instance = null
    }
  }
}

export { GlobalRobustKeyCapture }
