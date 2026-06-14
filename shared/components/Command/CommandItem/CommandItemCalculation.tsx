import type { CalculationSuggestion } from "../../../types"
import { ContentBlocks } from "../../ContentBlocks"
import { Icon } from "../../Icon"

interface CommandItemCalculationProps {
  suggestion: CalculationSuggestion
}

// Renders an ephemeral inline calculation result inside a real cmdk row. The
// structured content is drawn by the shared ContentBlocks renderer; the row
// stays a single selectable unit (blocks are display-only). Selecting it copies
// `copyValue` (handled in selectCommand). See docs/v_next/11-calculations.md.
export function CommandItemCalculation({
  suggestion,
}: CommandItemCalculationProps) {
  return (
    <>
      <div className="command-item-content">
        <Icon icon={suggestion.icon} color={suggestion.color} />
        <ContentBlocks blocks={suggestion.content} className="flex-1" />
      </div>
      <span cmdk-raycast-meta="">Copy</span>
    </>
  )
}
