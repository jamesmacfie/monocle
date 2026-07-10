// Architecture: background feature layer (extension-to-extension). The shared
// disable side-effect for the extension registry: drop every approved peer's
// cached command tree and rebuild the search index. Lives in a leaf file so
// both the palette commands (commands.ts) and the settings-page onConfigChange
// (index.ts) can call it without an index.ts ↔ commands.ts import cycle.
// Dynamic imports mirror the cycle-avoidance in index.ts's rebuildIndex.
export const dropAllPeerTrees = async (): Promise<void> => {
  const { clearAllExtensionRegistrations } = await import(
    "../../commands/extensionSdk"
  )
  await clearAllExtensionRegistrations()
  const { invalidateSearchIndex } = await import("../../commands/searchIndex")
  invalidateSearchIndex()
}
