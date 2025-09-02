import type { ParentCommand, RunCommand } from "../../../types/"
import {
  getActiveTab,
  getRecentDownloads,
  sendTabMessage,
  showDownload,
} from "../../utils/browser"
import { createNoOpCommand } from "../../utils/commands"

interface DownloadItem {
  id: number
  filename: string
  finalUrl: string
  mime?: string
  startTime: string
  totalBytes: number
  state: "in_progress" | "interrupted" | "complete"
  paused?: boolean
  canResume?: boolean
  error?: string
  bytesReceived: number
  estimatedEndTime?: string
  url: string
}

// File type to icon mapping
function getFileTypeIcon(
  filename: string,
  mime?: string,
): { type: "lucide"; name: string } {
  const extension = filename.toLowerCase().split(".").pop() || ""

  // Check MIME type first, then extension
  if (mime) {
    if (mime.startsWith("image/")) return { type: "lucide", name: "Image" }
    if (mime.startsWith("video/")) return { type: "lucide", name: "Video" }
    if (mime.startsWith("audio/")) return { type: "lucide", name: "Music" }
    if (mime.includes("pdf")) return { type: "lucide", name: "FileText" }
    if (mime.includes("zip") || mime.includes("rar") || mime.includes("tar"))
      return { type: "lucide", name: "Archive" }
    if (mime.includes("text/")) return { type: "lucide", name: "FileText" }
    if (mime.includes("application/json"))
      return { type: "lucide", name: "Braces" }
    if (mime.includes("application/javascript"))
      return { type: "lucide", name: "Code2" }
    if (
      mime.includes("application/msword") ||
      mime.includes(
        "application/vnd.openxmlformats-officedocument.wordprocessingml",
      )
    )
      return { type: "lucide", name: "FileText" }
    if (
      mime.includes("application/vnd.ms-excel") ||
      mime.includes(
        "application/vnd.openxmlformats-officedocument.spreadsheetml",
      )
    )
      return { type: "lucide", name: "Table" }
    if (
      mime.includes("application/vnd.ms-powerpoint") ||
      mime.includes(
        "application/vnd.openxmlformats-officedocument.presentationml",
      )
    )
      return { type: "lucide", name: "Presentation" }
  }

  // Fallback to extension-based detection
  switch (extension) {
    // Images
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "bmp":
    case "svg":
    case "webp":
    case "ico":
      return { type: "lucide", name: "Image" }

    // Videos
    case "mp4":
    case "avi":
    case "mov":
    case "wmv":
    case "flv":
    case "mkv":
    case "webm":
    case "m4v":
      return { type: "lucide", name: "Video" }

    // Audio
    case "mp3":
    case "wav":
    case "flac":
    case "aac":
    case "m4a":
    case "ogg":
    case "wma":
      return { type: "lucide", name: "Music" }

    // Documents
    case "pdf":
      return { type: "lucide", name: "FileText" }
    case "doc":
    case "docx":
    case "rtf":
    case "odt":
      return { type: "lucide", name: "FileText" }
    case "xls":
    case "xlsx":
    case "csv":
    case "ods":
      return { type: "lucide", name: "Table" }
    case "ppt":
    case "pptx":
    case "odp":
      return { type: "lucide", name: "Presentation" }

    // Code files
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "html":
    case "css":
    case "scss":
    case "less":
    case "py":
    case "java":
    case "c":
    case "cpp":
    case "h":
    case "php":
    case "rb":
    case "go":
    case "rs":
    case "swift":
    case "kt":
    case "sh":
    case "bat":
    case "ps1":
      return { type: "lucide", name: "Code2" }

    // Data files
    case "json":
    case "xml":
    case "yaml":
    case "yml":
    case "toml":
      return { type: "lucide", name: "Braces" }

    // Archives
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
    case "bz2":
    case "xz":
      return { type: "lucide", name: "Archive" }

    // Executables
    case "exe":
    case "msi":
    case "app":
    case "deb":
    case "rpm":
    case "dmg":
    case "pkg":
      return { type: "lucide", name: "Play" }

    // Text files
    case "txt":
    case "md":
    case "readme":
    case "log":
      return { type: "lucide", name: "FileText" }

    default:
      return { type: "lucide", name: "Download" }
  }
}

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B"
  const k = 1024
  const sizes = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

// Format download time
function formatDownloadTime(timeString: string): string {
  try {
    const date = new Date(timeString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(minutes / 60)
    const days = Math.floor(hours / 24)

    if (days > 0) return `${days}d ago`
    if (hours > 0) return `${hours}h ago`
    if (minutes > 0) return `${minutes}m ago`
    return "Just now"
  } catch (_error) {
    return "Unknown"
  }
}

export const downloads: ParentCommand = {
  id: "downloads",
  name: "Downloads",
  description: "Browse and manage your downloads",
  icon: { type: "lucide", name: "Download" },
  color: "blue",
  keywords: ["downloads", "files", "recent", "downloaded"],
  enableDeepSearch: true,
  commands: async () => {
    try {
      const downloadItems = await getRecentDownloads(50)

      if (!downloadItems || downloadItems.length === 0) {
        return [
          createNoOpCommand(
            "no-downloads",
            "No downloads found",
            "No recent downloads available",
            { type: "lucide", name: "DownloadX" },
          ),
        ]
      }

      return downloadItems
        .filter(
          (item: DownloadItem) => item.filename && item.state === "complete",
        )
        .map((item: DownloadItem): RunCommand => {
          const fileIcon = getFileTypeIcon(item.filename, item.mime)
          const fileSize = formatFileSize(item.totalBytes)
          const timeAgo = formatDownloadTime(item.startTime)

          // Extract just the filename without full path
          const filename = item.filename.split("/").pop() || item.filename

          return {
            id: `download-${item.id}`,
            name: filename,
            description: `${fileSize} • Downloaded ${timeAgo}`,
            icon: fileIcon,
            color: "blue",
            keywords: [
              filename.toLowerCase(),
              fileSize.toLowerCase(),
              "download",
              "file",
            ],
            actionLabel: "Show in Finder",
            run: async () => {
              const activeTab = await getActiveTab()

              try {
                // Always show download location in Finder/Explorer
                await showDownload(item.id)

                if (activeTab) {
                  await sendTabMessage(activeTab.id, {
                    type: "monocle-alert",
                    level: "info",
                    message: `Showing ${filename} in Finder`,
                    icon: { name: "FolderOpen" },
                  })
                }
              } catch (error) {
                console.error(`Failed to show download: ${filename}`, error)

                if (activeTab) {
                  await sendTabMessage(activeTab.id, {
                    type: "monocle-alert",
                    level: "error",
                    message: `Failed to show ${filename}. File may have been moved or deleted.`,
                    icon: { name: "AlertTriangle" },
                  })
                }
              }
            },
          }
        })
        .sort((a, b) => {
          // Sort by download time (newest first)
          const aName = typeof a.name === "string" ? a.name : ""
          const bName = typeof b.name === "string" ? b.name : ""
          return aName.localeCompare(bName)
        })
    } catch (error) {
      console.error("Failed to load downloads:", error)
      return [
        createNoOpCommand(
          "downloads-error",
          "Error Loading Downloads",
          "Failed to fetch download history. Make sure the extension has downloads permission.",
          { type: "lucide", name: "AlertTriangle" },
        ),
      ]
    }
  },
}
