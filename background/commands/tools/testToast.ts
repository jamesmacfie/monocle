import type { ParentCommand, RunCommand } from "../../../types"

const testInfoToast: RunCommand = {
  id: "test-info-toast",
  name: "Info Toast",
  description: "Send a test info toast",
  icon: { type: "lucide", name: "Info" },
  color: "blue",
  run: async () => {
    // Use the new messaging pattern to show toast
    const tabs = await chrome.tabs.query({})
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "monocle-toast",
            level: "info",
            message: "This is a test info toast message!",
          })
        } catch (_error) {
          console.debug("Failed to send toast to tab", tab.id)
        }
      }
    }
  },
}

const testSuccessToast: RunCommand = {
  id: "test-success-toast",
  name: "Success Toast",
  description: "Send a test success toast",
  icon: { type: "lucide", name: "CheckCircle" },
  color: "green",
  run: async () => {
    const tabs = await chrome.tabs.query({})
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "monocle-toast",
            level: "success",
            message: "Operation completed successfully! 🎉",
          })
        } catch (_error) {
          console.debug("Failed to send toast to tab", tab.id)
        }
      }
    }
  },
}

const testWarningToast: RunCommand = {
  id: "test-warning-toast",
  name: "Warning Toast",
  description: "Send a test warning toast",
  icon: { type: "lucide", name: "AlertCircle" },
  color: "orange",
  run: async () => {
    const tabs = await chrome.tabs.query({})
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "monocle-toast",
            level: "warning",
            message: "This is a warning message - please pay attention!",
          })
        } catch (_error) {
          console.debug("Failed to send toast to tab", tab.id)
        }
      }
    }
  },
}

const testErrorToast: RunCommand = {
  id: "test-error-toast",
  name: "Error Toast",
  description: "Send a test error toast",
  icon: { type: "lucide", name: "XCircle" },
  color: "red",
  run: async () => {
    const tabs = await chrome.tabs.query({})
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "monocle-toast",
            level: "error",
            message: "An error occurred while processing your request!",
          })
        } catch (_error) {
          console.debug("Failed to send toast to tab", tab.id)
        }
      }
    }
  },
}

const testMultipleToasts: RunCommand = {
  id: "test-multiple-toasts",
  name: "Multiple Toasts",
  description: "Send multiple toasts to test stacking",
  icon: { type: "lucide", name: "Layers" },
  color: "purple",
  run: async () => {
    const tabs = await chrome.tabs.query({})

    // Send multiple toasts with slight delays to test stacking
    for (const tab of tabs) {
      if (tab.id) {
        try {
          await chrome.tabs.sendMessage(tab.id, {
            type: "monocle-toast",
            level: "info",
            message: "First toast message",
          })

          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(tab.id!, {
                type: "monocle-toast",
                level: "success",
                message: "Second toast message",
              })
            } catch (_error) {
              console.debug("Failed to send second toast to tab", tab.id)
            }
          }, 500)

          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(tab.id!, {
                type: "monocle-toast",
                level: "warning",
                message: "Third toast message",
              })
            } catch (_error) {
              console.debug("Failed to send third toast to tab", tab.id)
            }
          }, 1000)
        } catch (_error) {
          console.debug("Failed to send first toast to tab", tab.id)
        }
      }
    }
  },
}

export const testToast: ParentCommand = {
  id: "test-toast",
  name: "Test Toast",
  description: "Test toast notification system",
  icon: { type: "lucide", name: "MessageSquare" },
  color: "gray",
  commands: async () => [
    testInfoToast,
    testSuccessToast,
    testWarningToast,
    testErrorToast,
    testMultipleToasts,
  ],
}
