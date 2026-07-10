/** Toggle an id in an in-flight tracking list. */
export const toggleId = (ids: string[], id: string, on: boolean): string[] =>
  on
    ? ids.includes(id)
      ? ids
      : [...ids, id]
    : ids.filter((current) => current !== id)
