import { callBrowserAPI } from "./browserApi"

export async function createWindow(createData: any): Promise<any> {
  return callBrowserAPI("windows", "create", createData)
}

export async function getCurrentWindow(): Promise<any> {
  return callBrowserAPI("windows", "getCurrent")
}

export async function updateWindow(
  windowId: number,
  updateInfo: any,
): Promise<any> {
  return callBrowserAPI("windows", "update", windowId, updateInfo)
}

export async function removeWindow(windowId: number): Promise<void> {
  return callBrowserAPI("windows", "remove", windowId)
}
