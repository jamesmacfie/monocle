import { Command, type LucideProps } from "lucide-react"
import { useState } from "react"
import type { ColorName, CommandIcon } from "../../shared/types"
import { darkenColor, lightenColor } from "../utils"
import { svgIconToDataUri } from "../utils/svg-icon"
import { getIconComponent } from "./iconRegistry"

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

interface IconProps extends LucideProps {
  icon?: CommandIcon
  // Backward compatibility - will be removed
  name?: string
  url?: string
  color?: ColorName | string
  noBackground?: boolean
}

const UrlImageIcon = ({ src }: { src: string }) => {
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    const FallbackIcon = getIconComponent("Globe") ?? Command

    return (
      <div className="icon-wrapper">
        <FallbackIcon size={10} className="icon-default" />
      </div>
    )
  }

  return (
    <div className="icon-wrapper favicon-wrapper">
      <img
        src={src}
        alt="icon"
        className="url-icon favicon"
        onError={() => setHasError(true)}
      />
    </div>
  )
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
  const isCssVar = typeof color === "string" && color.trim().startsWith("var(")
  const resolvedColor =
    typeof color === "string" && color in COLOR_MAP
      ? COLOR_MAP[color as ColorName]
      : typeof color === "string"
        ? color
        : COLOR_MAP.lightBlue

  // Generate background gradient style
  const backgroundStyle = !noBackground
    ? isCssVar
      ? {
          background: `linear-gradient(135deg, ${resolvedColor}, ${resolvedColor})`,
        }
      : {
          background: `linear-gradient(135deg, ${lightenColor(
            resolvedColor,
            15,
          )}, ${darkenColor(resolvedColor, 15)})`,
        }
    : undefined

  // Handle new CommandIcon type first
  if (icon) {
    if (icon.type === "url") {
      return <UrlImageIcon src={icon.url} />
    } else if (icon.type === "svg") {
      // Untrusted markup (site SDK): render only as a static <img> data URI,
      // never inline — the browser's secure static image mode disables
      // scripts, event handlers, and external fetches. See
      // shared/utils/svg-icon.ts before changing this.
      return <UrlImageIcon src={svgIconToDataUri(icon.svg)} />
    } else if (icon.type === "lucide") {
      const IconComponent = getIconComponent(icon.name) ?? Command
      return (
        <div className="icon-wrapper" style={backgroundStyle}>
          <IconComponent size={10} {...props} />
        </div>
      )
    }
  }

  // Backward compatibility - handle old interface
  if (url) {
    return <UrlImageIcon src={url} />
  }

  // Handle Lucide icon type or fallback to default
  const LegacyIconComponent = name ? getIconComponent(name) : undefined

  if (!LegacyIconComponent) {
    // Return a default icon if name is invalid/missing
    return (
      <div className="icon-wrapper" style={backgroundStyle}>
        <Command size={10} className="icon-default" />
      </div>
    )
  }

  return (
    <div className="icon-wrapper" style={backgroundStyle}>
      <LegacyIconComponent size={10} {...props} />
    </div>
  )
}
