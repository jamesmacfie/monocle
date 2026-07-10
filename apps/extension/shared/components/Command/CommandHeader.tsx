import { Command } from "cmdk"
import { ChevronLeft } from "lucide-react"
import type { RefObject } from "react"
import type { Page } from "../../store/slices/navigation.slice"
import { MonocleMark } from "../MonocleMark"
import { getDisplayName } from "./CommandName"

export interface CommandHeaderProps {
  pageCount: number
  currentPage: Page
  inputRef: RefObject<HTMLInputElement | null>
  onNavigateBack: () => void
  onSearchChange: (search: string) => void
}

export function CommandHeader({
  pageCount,
  currentPage,
  inputRef,
  onNavigateBack,
  onSearchChange,
}: CommandHeaderProps) {
  return (
    <>
      <div cmdk-raycast-top-shine="" />
      <div className="cmdk-input-wrapper">
        {pageCount > 1 && (
          <div className="cmdk-back-button" onClick={onNavigateBack}>
            <ChevronLeft size={16} />
          </div>
        )}
        <Command.Input
          ref={inputRef}
          value={currentPage.searchValue}
          onValueChange={onSearchChange}
          autoFocus
          placeholder={
            pageCount === 1
              ? "Search for commands..."
              : `Search in ${currentPage.parent ? getDisplayName(currentPage.parent.name) : currentPage.id}`
          }
        />
        <MonocleMark
          variant="glyph"
          size={18}
          className="cmdk-input-monocle"
          title="Monocle"
        />
      </div>
      <hr cmdk-raycast-loader="" />
    </>
  )
}
