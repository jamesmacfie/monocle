type ExtensionGlobal = typeof globalThis & {
  browser?: typeof chrome
  chrome?: typeof chrome
}

export function getBrowserAPI(): typeof chrome {
  const scope = globalThis as ExtensionGlobal
  const api = scope.browser?.runtime?.id ? scope.browser : scope.chrome

  return (api || scope.browser || {}) as typeof chrome
}
