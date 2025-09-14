interface Props {
  error: string
  onClearError: () => void
}

export function CommandNavigationError({ error, onClearError }: Props) {
  return (
    <div className="border-b px-4 py-2 bg-[var(--color-error-bg)] border-[var(--color-error-border)]">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[var(--color-error-fg)]">
          <span className="text-sm font-medium">Error:</span>
          <span className="text-sm">{error}</span>
        </div>
        <button
          onClick={onClearError}
          className="text-[var(--color-error-border)] hover:text-[var(--color-error-fg)] text-xs px-2 py-1 rounded transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
