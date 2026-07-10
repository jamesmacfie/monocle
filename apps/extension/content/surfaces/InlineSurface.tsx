import { useEffect } from "react"
import type { Surface } from "../../shared/types"
import { sendRuntimeMessageSafe } from "../../shared/utils/extension-api"
import { mountInlineSurface } from "./inlineSurfaceController"

export function InlineSurface({ surface }: { surface: Surface }) {
  useEffect(() => {
    if (window.top !== window || surface.kind !== "inline") return
    return mountInlineSurface({
      surface: surface as never,
      onAction: async (actionId) => {
        if (!surface.ownerId) return { success: false }
        const result = await sendRuntimeMessageSafe<{
          success?: boolean
          error?: string
        }>({
          type: "monocle-surface-action",
          ownerId: surface.ownerId,
          surfaceId: surface.id,
          actionId,
        })
        return result?.success
          ? { success: true }
          : { success: false, error: result?.error }
      },
    })
  }, [surface])

  return null
}
