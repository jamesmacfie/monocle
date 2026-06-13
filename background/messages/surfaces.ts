// Architecture: background message layer. The generic get-surfaces query: the
// SurfaceHost (content overlay + new-tab) sends its URL and receives every
// surface whose urlMatch admits it. The host filters by kind locally. Surfaces
// are pushed into the store by features and automations; this is the read side.
// See docs/surfaces.md.
import type { GetSurfacesMessage } from "../../shared/types"
import { getSurfacesForUrl } from "../surfaces"
import { createMessageHandler } from "../utils/messages"

const handleGetSurfaces = async (message: GetSurfacesMessage) => {
  return { surfaces: await getSurfacesForUrl(message.url) }
}

export const getSurfaces = createMessageHandler(
  handleGetSurfaces,
  "Failed to get surfaces",
)
