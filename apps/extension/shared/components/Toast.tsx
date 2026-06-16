import { useEffect, useState } from "react"
import { match } from "ts-pattern"
import { Icon } from "./Icon"

export interface Props {
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
}: Props) => {
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
    const chipClass = match(level)
      .with(
        "info",
        () => "bg-[var(--color-info-bg)] text-[var(--color-info-border)]",
      )
      .with(
        "warning",
        () => "bg-[var(--color-warning-bg)] text-[var(--color-warning-border)]",
      )
      .with(
        "success",
        () => "bg-[var(--color-success-bg)] text-[var(--color-success-border)]",
      )
      .with(
        "error",
        () => "bg-[var(--color-error-bg)] text-[var(--color-error-border)]",
      )
      .exhaustive()

    const icon = match(level)
      .with("info", () => <Icon name="Info" noBackground size={16} />)
      .with("warning", () => <Icon name="AlertCircle" noBackground size={16} />)
      .with("success", () => <Icon name="CheckCircle" noBackground size={16} />)
      .with("error", () => <Icon name="XCircle" noBackground size={16} />)
      .exhaustive()

    return (
      <div
        className={`w-6 h-6 rounded-md flex items-center justify-center ${chipClass}`}
      >
        {icon}
      </div>
    )
  }

  const getToastClasses = () => {
    const baseClasses =
      "flex items-center p-3.5 rounded-lg min-w-[320px] max-w-[440px] shadow-xl transition-all duration-300 pointer-events-auto border"
    const visibilityClasses = isVisible
      ? "translate-x-0 opacity-100"
      : "translate-x-full opacity-0"
    const exitingClasses = isExiting ? "translate-x-full opacity-0" : ""

    // Use status tokens and inverse foreground for strong toasts
    const levelClasses = match(level)
      .with(
        "info",
        () =>
          "bg-[var(--color-info-border)] text-[var(--color-fg-inverse)] border-[var(--color-info-border)]",
      )
      .with(
        "warning",
        () =>
          "bg-[var(--color-warning-border)] text-[var(--color-fg-inverse)] border-[var(--color-warning-border)]",
      )
      .with(
        "success",
        () =>
          "bg-[var(--color-success-border)] text-[var(--color-fg-inverse)] border-[var(--color-success-border)]",
      )
      .with(
        "error",
        () =>
          "bg-[var(--color-error-border)] text-[var(--color-fg-inverse)] border-[var(--color-error-border)]",
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
