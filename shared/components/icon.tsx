import * as icons from "lucide-react"
import type * as React from "react"
import type { ColorName, CommandIcon } from "../../types/"
import { darkenColor, lightenColor } from "../utils"

const COLOR_MAP: Record<ColorName, string> = {
  red: "#ef4444",
  green: "#10b981",
  blue: "#3b82f6",
  amber: "#fbbf24",
  lightBlue: "#37adff",
  gray: "#7c7c7d",
  purple: "#8b5cf6",
  orange: "#f97316",
  teal: "#14b8a6",
  pink: "#ec4899",
  indigo: "#6366f1",
  yellow: "#eab308",
}

interface IconProps extends icons.LucideProps {
  icon?: CommandIcon
  // Backward compatibility - will be removed
  name?: string
  url?: string
  color?: ColorName | string
  noBackground?: boolean
}

// Helper to get Lucide icon component by name
export const Icon = ({
  icon,
  name, // backward compatibility
  url, // backward compatibility
  color = "lightBlue", // Default to lightBlue color name
  noBackground = false,
  ...props
}: IconProps) => {
  // Resolve color to hex value
  const resolvedColor =
    typeof color === "string" && color in COLOR_MAP
      ? COLOR_MAP[color as ColorName]
      : typeof color === "string"
        ? color
        : COLOR_MAP.lightBlue

  // Generate background gradient style
  const backgroundStyle = !noBackground
    ? {
        background: `linear-gradient(135deg, ${lightenColor(
          resolvedColor,
          15,
        )}, ${darkenColor(resolvedColor, 15)})`,
      }
    : undefined

  // Handle new CommandIcon type first
  if (icon) {
    if (icon.type === "url") {
      return (
        <div className="icon-wrapper favicon-wrapper">
          <img src={icon.url} alt="icon" className="url-icon favicon" />
        </div>
      )
    } else if (icon.type === "lucide" && icon.name in icons) {
      // biome-ignore lint/performance/noDynamicNamespaceImportAccess: we're ok here
      const IconComponent = icons[
        icon.name as keyof typeof icons
      ] as React.ElementType
      return (
        <div className="icon-wrapper" style={backgroundStyle}>
          <IconComponent size={10} {...props} />
        </div>
      )
    }
  }

  // Backward compatibility - handle old interface
  if (url) {
    return (
      <div className="icon-wrapper favicon-wrapper">
        <img src={url} alt="icon" className="url-icon favicon" />
      </div>
    )
  }

  // Handle Lucide icon type or fallback to default
  if (!name || !(name in icons)) {
    // Return a default icon if name is invalid/missing
    return (
      <div className="icon-wrapper" style={backgroundStyle}>
        <icons.Command size={10} className="icon-default" />
      </div>
    )
  }

  // Explicitly cast the dynamic component to ElementType
  // biome-ignore lint/performance/noDynamicNamespaceImportAccess: we're ok here
  const IconComponent = icons[name as keyof typeof icons] as React.ElementType

  return (
    <div className="icon-wrapper" style={backgroundStyle}>
      <IconComponent size={10} {...props} />
    </div>
  )
}
