import type React from "react"
import { useEffect, useState } from "react"

interface ClockProps {
  className?: string
}

export const Clock: React.FC<ClockProps> = ({ className = "" }) => {
  const [time, setTime] = useState(new Date())

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date())
    }, 1000)

    return () => clearInterval(interval)
  }, [])

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString([], {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  }

  return (
    <div className={`text-center ${className}`}>
      <div className="text-6xl font-light text-gray-900 mb-2">
        {formatTime(time)}
      </div>
      <div className="text-lg text-gray-600">{formatDate(time)}</div>
    </div>
  )
}
