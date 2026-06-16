import type { SettingsCatalogCommand } from "../../shared/types"

export type CatalogSection = {
  id: string
  label: string
  items: SettingsCatalogCommand[]
  defaultCollapsed: boolean
}

type CatalogSectionMeta = {
  id: string
  label: string
  defaultCollapsed: boolean
  categorySort: string
  rank: number
}

const collapsedBrowserSections = [
  {
    id: "browser:bookmarks",
    label: "Bookmarks",
    parentIds: ["bookmarks"],
    rank: 1,
  },
  {
    id: "browser:containers",
    label: "Containers",
    parentIds: ["open-container-tab", "open-current-tab-in-container"],
    rank: 2,
  },
]

const getSectionMeta = (
  command: SettingsCatalogCommand,
): CatalogSectionMeta => {
  if (command.categoryId === "browser") {
    const topParentId = command.parentPath[0]
    const collapsedSection = collapsedBrowserSections.find((section) =>
      section.parentIds.some(
        (parentId) => command.id === parentId || topParentId === parentId,
      ),
    )

    if (collapsedSection) {
      return {
        id: collapsedSection.id,
        label: collapsedSection.label,
        defaultCollapsed: true,
        categorySort: command.categoryLabel,
        rank: collapsedSection.rank,
      }
    }
  }

  return {
    id: `category:${command.categoryId}`,
    label: command.categoryLabel,
    defaultCollapsed: false,
    categorySort: command.categoryLabel,
    rank: 0,
  }
}

export const getRuleCount = (command: SettingsCatalogCommand) =>
  (command.settings.urlRules?.allowUrls?.length ?? 0) +
  (command.settings.urlRules?.denyUrls?.length ?? 0)

export const hasCustomKeybinding = (command: SettingsCatalogCommand) =>
  Boolean(command.settings.keybinding)

export const matchesCommandQuery = (
  command: SettingsCatalogCommand,
  query: string,
) => {
  if (!query) {
    return true
  }

  const haystack = [
    command.id,
    command.name,
    command.description ?? "",
    command.categoryLabel,
    command.effectiveKeybinding ?? "",
    ...command.parentNames,
  ]
    .join(" ")
    .toLowerCase()

  return haystack.includes(query)
}

export const getCategoryOptions = (commands: SettingsCatalogCommand[]) =>
  Array.from(
    new Map(
      commands.map((command) => [command.categoryId, command.categoryLabel]),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]))

export const groupByCatalogSection = (
  commands: SettingsCatalogCommand[],
): CatalogSection[] => {
  const sections = new Map<
    string,
    CatalogSection & { categorySort: string; rank: number }
  >()

  for (const command of commands) {
    const sectionMeta = getSectionMeta(command)
    const existing = sections.get(sectionMeta.id)

    if (existing) {
      existing.items.push(command)
      continue
    }

    sections.set(sectionMeta.id, {
      id: sectionMeta.id,
      label: sectionMeta.label,
      defaultCollapsed: sectionMeta.defaultCollapsed,
      categorySort: sectionMeta.categorySort,
      rank: sectionMeta.rank,
      items: [command],
    })
  }

  return [...sections.values()]
    .sort((a, b) => {
      const categorySort = a.categorySort.localeCompare(b.categorySort)
      if (categorySort !== 0) {
        return categorySort
      }

      return a.rank - b.rank || a.label.localeCompare(b.label)
    })
    .map(({ categorySort: _categorySort, rank: _rank, ...section }) => section)
}

export const formatUsageDate = (lastUsed: number) => {
  if (!lastUsed) {
    return "Never"
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(lastUsed)
}
