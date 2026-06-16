import { beforeEach, describe, expect, it, vi } from "vitest"

type PermissionState = Record<string, boolean>
type MockedPermissionFunction = {
  mock: {
    invocationCallOrder: number[]
  }
}

const installChromeStubs = ({
  permissionState,
  requestImpl,
}: {
  permissionState: PermissionState
  requestImpl: (details: {
    permissions?: chrome.runtime.ManifestPermissions[]
  }) => Promise<boolean>
}) => {
  vi.stubGlobal("browser", undefined)
  vi.stubGlobal("chrome", {
    runtime: {
      id: "monocle-test",
    },
    permissions: {
      contains: vi.fn(
        async ({
          permissions,
        }: {
          permissions?: chrome.runtime.ManifestPermissions[]
        }) => {
          return (permissions ?? []).every(
            (permission) => permissionState[permission] === true,
          )
        },
      ),
      request: vi.fn(requestImpl),
    },
  })
}

const importRequestPermission = async () => {
  const module = await import("./requestPermission")
  return module.requestPermission
}

beforeEach(() => {
  vi.resetModules()
  vi.unstubAllGlobals()
})

describe("requestPermission", () => {
  it("requests before checking post-request browser truth", async () => {
    const permissionState = { bookmarks: true }
    installChromeStubs({
      permissionState,
      requestImpl: vi.fn(async () => true),
    })

    const requestPermission = await importRequestPermission()
    await expect(
      requestPermission({
        type: "monocle-permission-request",
        permission: "bookmarks",
      }),
    ).resolves.toEqual({ granted: true })

    expect(chrome.permissions.request).toHaveBeenCalledOnce()
    const requestMock = chrome.permissions
      .request as unknown as MockedPermissionFunction
    const containsMock = chrome.permissions
      .contains as unknown as MockedPermissionFunction
    expect(requestMock.mock.invocationCallOrder[0]).toBeLessThan(
      containsMock.mock.invocationCallOrder[0],
    )
  })

  it("returns granted truth after a successful permission request", async () => {
    const permissionState = { bookmarks: false }
    installChromeStubs({
      permissionState,
      requestImpl: vi.fn(async () => {
        permissionState.bookmarks = true
        return true
      }),
    })

    const requestPermission = await importRequestPermission()
    await expect(
      requestPermission({
        type: "monocle-permission-request",
        permission: "bookmarks",
      }),
    ).resolves.toEqual({ granted: true })

    expect(chrome.permissions.request).toHaveBeenCalledOnce()
  })

  it("returns denied truth after a rejected permission request", async () => {
    const permissionState = { bookmarks: false }
    installChromeStubs({
      permissionState,
      requestImpl: vi.fn(async () => false),
    })

    const requestPermission = await importRequestPermission()
    await expect(
      requestPermission({
        type: "monocle-permission-request",
        permission: "bookmarks",
      }),
    ).resolves.toEqual({ granted: false })
  })

  it("returns structured errors for browser permission failures", async () => {
    const permissionState = { bookmarks: false }
    installChromeStubs({
      permissionState,
      requestImpl: vi.fn(async () => {
        throw new Error("User gesture required")
      }),
    })

    const requestPermission = await importRequestPermission()
    await expect(
      requestPermission({
        type: "monocle-permission-request",
        permission: "bookmarks",
      }),
    ).resolves.toEqual({
      granted: false,
      error: "Failed to request bookmarks permission: User gesture required",
    })
  })
})
