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

  const formattedTime = time.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })

  const formattedDate = time.toLocaleDateString([], {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  return (
    <div className={`text-center ${className}`}>
      <div className="text-6xl font-light text-white mb-2 drop-shadow-lg">
        {formattedTime}
      </div>
      <div className="text-lg text-white/90 drop-shadow-lg">
        {formattedDate}
      </div>
    </div>
  )
}
