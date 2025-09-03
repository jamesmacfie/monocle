interface Props {
  error: string
  onClearError: () => void
}

export function CommandNavigationError({ error, onClearError }: Props) {
  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-red-50 dark:bg-red-900/20 px-4 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
          <span className="text-sm font-medium">Error:</span>
          <span className="text-sm">{error}</span>
        </div>
        <button
          onClick={onClearError}
          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-200 text-xs px-2 py-1 rounded hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>)
}