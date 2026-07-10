import { createContext, useContext } from "react"
import type { Browser } from "../types"

const MessageContext = createContext<Partial<Browser.Context>>({})

export function MessageContextProvider({
  value,
  children,
}: {
  value: Partial<Browser.Context>
  children: React.ReactNode
}) {
  return (
    <MessageContext.Provider value={value}>{children}</MessageContext.Provider>
  )
}

export const useMessageContext = (): Partial<Browser.Context> =>
  useContext(MessageContext)
