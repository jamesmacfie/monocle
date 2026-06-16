import { isFirefox } from "../../shared/utils/browser"
import { callBrowserAPI } from "./browserApi"

export async function getBookmarkTree(): Promise<any[]> {
  try {
    if (isFirefox) {
      return await (browser as any).bookmarks.getTree()
    }

    return await callBrowserAPI("bookmarks", "getTree")
  } catch (error) {
    console.error("Failed to get bookmark tree:", error)
    throw error
  }
}

export async function getBookmarkChildren(id: string): Promise<any[]> {
  try {
    if (isFirefox) {
      return await (browser as any).bookmarks.getChildren(id)
    }

    return await callBrowserAPI("bookmarks", "getChildren", id)
  } catch (error) {
    console.error("Failed to get bookmark children:", error)
    throw error
  }
}

export async function createBookmark(args: {
  parentId?: string
  title: string
  url: string
}): Promise<any> {
  try {
    if (isFirefox) {
      return await (browser as any).bookmarks.create(args)
    }

    return await callBrowserAPI("bookmarks", "create", args)
  } catch (error) {
    console.error("Failed to create bookmark:", error)
    throw error
  }
}
