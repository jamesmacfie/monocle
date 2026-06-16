import * as React from "react"

const { useState, useCallback } = React

import type { Browser } from "../../shared/types"
import type { CommandData } from "../types"
import { useSendMessage } from "./useSendMessage"

export function useGetCommands(context?: Partial<Browser.Context>) {
  const [data, setData] = useState<CommandData>({
    favorites: [],
    suggestions: [],
  })
  const [isLoading, setIsLoading] = useState(false)
  const sendMessage = useSendMessage()

  const fetchCommands = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await sendMessage(
        {
          type: "monocle-commands-get",
        },
        context,
      )

      if (response.error) {
        console.error("Error fetching suggestions:", response.error)
        const emptyData = {
          favorites: [],
          suggestions: [],
        }
        setData(emptyData)
        return emptyData
      } else {
        const newData = {
          favorites: response.favorites || [],
          suggestions: response.suggestions || [],
        }
        setData(newData)
        return newData
      }
    } catch (error) {
      console.error("[useGetCommands] Error sending message:", error)
      const emptyData = {
        favorites: [],
        suggestions: [],
      }
      setData(emptyData)
      return emptyData
    } finally {
      setIsLoading(false)
    }
  }, [sendMessage])

  return {
    data,
    isLoading,
    fetchCommands,
  }
}
