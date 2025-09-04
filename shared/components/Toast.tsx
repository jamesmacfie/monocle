import { useEffect, useState } from "react"
import { match } from "ts-pattern"
import { Icon } from "./Icon"

export interface ToastProps {
  id: string
  message: string
  level: "info" | "warning" | "success" | "error"
  onRemove: (id: string) => void
  duration?: number
}

export const Toast = ({
  id,
  message,
  level,
  onRemove,
  duration = 3000,
}: ToastProps) => {
  const [isVisible, setIsVisible] = useState(false)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    // Show toast with animation
    setIsVisible(true)

    // Start exit animation before removal
    const exitTimer = setTimeout(() => {
      setIsExiting(true)
    }, duration - 300) // Start exit animation 300ms before removal

    // Remove toast after duration
    const removeTimer = setTimeout(() => {
      onRemove(id)
    }, duration)

    return () => {
      clearTimeout(exitTimer)
      clearTimeout(removeTimer)
    }
  }, [id, duration, onRemove])

  const getIcon = () => {
    return match(level)
      .with("info", () => <Icon name="Info" noBackground size={16} />)
      .with("warning", () => <Icon name="AlertCircle" noBackground size={16} />)
      .with("success", () => <Icon name="CheckCircle" noBackground size={16} />)
      .with("error", () => <Icon name="XCircle" noBackground size={16} />)
      .exhaustive()
  }

  const getToastClasses = () => {
    const baseClasses =
      "flex items-center p-3 rounded-lg min-w-[300px] max-w-[400px] shadow-lg transition-all duration-300 pointer-events-auto"
    const visibilityClasses = isVisible
      ? "translate-x-0 opacity-100"
      : "translate-x-full opacity-0"
    const exitingClasses = isExiting ? "translate-x-full opacity-0" : ""

    const levelClasses = match(level)
      .with(
        "info",
        () => "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-200",
      )
      .with(
        "warning",
        () =>
          "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-200",
      )
      .with(
        "success",
        () =>
          "bg-green-50 btext-green-700 dark:bg-green-900/20 dark:text-green-200",
      )
      .with(
        "error",
        () => "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-200",
      )
      .exhaustive()

    return `${baseClasses} ${visibilityClasses} ${exitingClasses} ${levelClasses}`
  }

  return (
    <div className={getToastClasses()}>
      <div className="mr-3 flex-shrink-0">{getIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium leading-5 break-words">
          {message}
        </div>
      </div>
    </div>
  )
}
