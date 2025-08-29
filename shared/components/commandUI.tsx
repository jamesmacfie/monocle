import { ChevronLeft } from "lucide-react"
import type { FormEvent } from "react"
import { useEffect, useRef } from "react"
import type { CommandSuggestionUI } from "../../types"
import { useActionLabel } from "../hooks/useActionLabel"
import type { Page, UI } from "../hooks/useCommandNavigation"
import AlertListener from "./Alert"
import { Icon } from "./Icon"

type InputItemProps = {
  item: Extract<CommandSuggestionUI, { type: "input" }>
  defaultValue: string | undefined
  inputRef: React.RefObject<HTMLInputElement> | null
  onEnter: () => void
}

function InputItem({ item, defaultValue, inputRef, onEnter }: InputItemProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      onEnter()
    }
  }

  return (
    <div className="cmdk-ui-input">
      {item.label && <label htmlFor={item.id}>{item.label}</label>}
      <input
        id={item.id}
        name={item.id}
        type="text"
        ref={inputRef}
        placeholder={item.placeholder}
        defaultValue={defaultValue}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

type TextItemProps = {
  item: Extract<CommandSuggestionUI, { type: "text" }>
}

function TextItem({ item }: TextItemProps) {
  return (
    <div className="cmdk-ui-text">
      <p>{item.label}</p>
    </div>
  )
}

type Props = {
  currentPage: Page
  ui: UI
  onBack: () => void
  onEscape: () => void
  onExecute: (id: string, formValues: Record<string, string>) => Promise<void>
}

export default function CommandUI({
  currentPage,
  ui,
  onBack,
  onEscape,
  onExecute,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const actionLabel = useActionLabel(currentPage)

  useEffect(() => {
    // Focus the first input element when mounted
    inputRef.current?.focus()

    // Add escape key listener for navigation
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault()
        onEscape()
      }
    }

    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [onEscape])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()

    const formData = new FormData(e.target as HTMLFormElement)
    const formValuesObject: Record<string, string> = {}

    formData.forEach((value, key) => {
      formValuesObject[key] = value.toString()
    })

    await onExecute(ui.id, formValuesObject)
  }

  const handleEnter = () => {
    formRef.current?.requestSubmit()
  }

  return (
    <>
      <div className="cmdk-ui-container">
        <div className="cmdk-ui-name-wrapper">
          <div className="cmdk-back-button" onClick={onBack}>
            <ChevronLeft size={16} />
          </div>

          <div className="cmdk-ui-command-name">
            <h3>{ui.name}</h3>
          </div>
        </div>
        <AlertListener />

        <form
          ref={formRef}
          onSubmit={handleSubmit}
          className="cmdk-ui-content"
          id="command-form"
        >
          {ui.ui.map((item, index) => (
            <div key={item.id} className="cmdk-ui-item">
              {item.type === "input" && (
                <InputItem
                  item={item}
                  defaultValue={item.defaultValue}
                  inputRef={index === 0 ? inputRef : null}
                  onEnter={handleEnter}
                />
              )}

              {item.type === "text" && <TextItem item={item} />}
            </div>
          ))}
        </form>
      </div>
      <div cmdk-raycast-footer="">
        <div className="parent-command">
          {currentPage.parent && (
            <>
              <Icon
                name={currentPage.parent.icon?.name}
                url={currentPage.parent.icon?.url}
                color={currentPage.parent.color}
              />
              <span>{currentPage.parent.name}</span>
            </>
          )}
        </div>

        <button cmdk-raycast-open-trigger="" form="command-form">
          {actionLabel}
          <kbd>↵</kbd>
        </button>
      </div>
    </>
  )
}
