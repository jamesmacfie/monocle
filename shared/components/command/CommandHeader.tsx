import { Command } from "cmdk"
import { ChevronLeft } from "lucide-react"
import type { RefObject } from "react"
import type { Page } from "../../store/slices/navigation.slice"
import { getDisplayName } from "./CommandName"

export interface CommandHeaderProps {
  pages: Page[]
  currentPage: Page
  inputRef: RefObject<HTMLInputElement | null>
  onNavigateBack: () => void
  onSearchChange: (search: string) => void
}

export function CommandHeader({
  pages,
  currentPage,
  inputRef,
  onNavigateBack,
  onSearchChange,
}: CommandHeaderProps) {
  return (
    <>
      <div cmdk-raycast-top-shine="" />
      <div className="cmdk-input-wrapper">
        {pages.length > 1 && (
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
            pages.length === 1
              ? "Search for commands..."
              : `Search in ${currentPage.parent ? getDisplayName(currentPage.parent.name) : currentPage.id}`
          }
        />
      </div>
      <hr cmdk-raycast-loader="" />
    </>
  )
}
