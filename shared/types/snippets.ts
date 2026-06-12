// User-created text snippets stored under the independent
// `monocle-snippets` storage key (separate lifecycle from settings,
// like favorites and usage).

export interface Snippet {
  id: string
  name: string
  body: string
  createdAt: number
  updatedAt: number
}
