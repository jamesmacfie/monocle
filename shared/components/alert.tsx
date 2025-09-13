import { Copy, X } from "lucide-react"
import { useEffect, useState } from "react"
import { match } from "ts-pattern"
import type { AlertEvent } from "../../shared/types"
import { useCopyToClipboard } from "../hooks/useCopyToClipboard"
import { Icon } from "./Icon"

interface Props {
  message: string
  level: "info" | "warning" | "success" | "error"
  onClose?: () => void
  icon?: {
    name?: string
    url?: string
  }
  copyText?: string
}

export const Alert = ({ message, level, onClose, icon, copyText }: Props) => {
  const [_, copyToClipboard] = useCopyToClipboard()
  const getIcon = () => {
    if (icon) {
      return <Icon name={icon.name} url={icon.url} noBackground />
    }

    return match(level)
      .with("info", () => {
        return <Icon name={"Info"} noBackground size={16} />
      })
      .with("warning", () => {
        return <Icon name={"AlertCircle"} noBackground size={16} />
      })
      .with("success", () => {
        return <Icon name={"CheckCircle"} noBackground size={16} />
      })
      .with("error", () => {
        return <Icon name={"XCircle"} noBackground size={16} />
      })
      .exhaustive()
  }

  return (
    <div className={`alert ${level}`}>
      {getIcon()}
      <div className="alert-content">
        <div className="alert-message">{message}</div>
      </div>
      <div className="alert-actions">
        {copyText && (
          <button
            type="button"
            className="copy-button"
            onClick={() => copyToClipboard(copyText)}
          >
            <Copy size={16} />
          </button>
        )}
        {onClose && (
          <button type="button" className="close-button" onClick={onClose}>
            <X size={16} />
          </button>
        )}
      </div>
    </div>
  )
}

export default function AlertListener() {
  const [currentAlert, setCurrentAlert] = useState<Props | null>(null)

  const clearAlert = () => {
    setCurrentAlert(null)
  }

  useEffect(() => {
    const handleMessage = (
      message: any,
      _sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void,
    ) => {
      if (message.type === "monocle-alert") {
        const alertEvent = message as AlertEvent
        setCurrentAlert(alertEvent)

        sendResponse({ received: true })
        return true
      }
    }

    chrome.runtime.onMessage.addListener(handleMessage)

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [])

  if (!currentAlert) {
    return null
  }

  return (
    <div className="alerts-container">
      <Alert
        key="current-alert"
        message={currentAlert.message}
        level={currentAlert.level}
        icon={currentAlert.icon}
        onClose={clearAlert}
        copyText={currentAlert.copyText}
      />
    </div>
  )
}
