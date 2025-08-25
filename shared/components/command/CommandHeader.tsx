import { Command } from "cmdk";
import { ChevronLeft } from "lucide-react";
import type { CommandHeaderProps } from "../../types/command";

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
              : `Search in ${currentPage.id}`
          }
        />
      </div>
      <hr cmdk-raycast-loader="" />
    </>
  );
}
