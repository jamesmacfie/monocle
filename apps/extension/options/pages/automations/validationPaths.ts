export type EditorValidationIssue = { path: string; message: string }

const segments = (path: string): string[] =>
  path.length === 0 ? [] : path.split(".")

export const pathStartsWith = (
  issuePath: string,
  prefix: Array<string | number>,
): boolean => {
  const issue = segments(issuePath)
  return prefix.every((part, index) => issue[index] === String(part))
}

export const directMessagesForPath = (
  issues: EditorValidationIssue[],
  path: Array<string | number>,
  childKeys: string[] = [],
): string[] => {
  const prefixLength = path.length
  return issues
    .filter((issue) => {
      if (!pathStartsWith(issue.path, path)) return false
      const next = segments(issue.path)[prefixLength]
      return next === undefined || !childKeys.includes(next)
    })
    .map((issue) => {
      const detail = segments(issue.path).slice(prefixLength).join(".")
      return detail ? `${detail}: ${issue.message}` : issue.message
    })
}
