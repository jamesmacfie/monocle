import * as React from "react"

const { useState, useCallback } = React

import type { CommandData } from "../types/command"
import { useSendMessage } from "./useSendMessage"

export function useGetCommands() {
  const [data, setData] = useState<CommandData>({
    favorites: [],
    suggestions: [],
    recents: [],
    deepSearchItems: [],
  })
  const [isLoading, setIsLoading] = useState(false)
  const sendMessage = useSendMessage()

  const fetchCommands = useCallback(async () => {
    setIsLoading(true)
    try {
      const response = await sendMessage({
        type: "get-commands",
      })

      if (response.error) {
        console.error("Error fetching suggestions:", response.error)
        setData({
          favorites: [],
          suggestions: [],
          recents: [],
          deepSearchItems: [],
        })
      } else {
        const newData = {
          favorites: response.favorites || [],
          suggestions: response.suggestions || [],
          recents: response.recents || [],
          deepSearchItems: response.deepSearchItems || [],
        }
        setData(newData)
      }
    } catch (error) {
      console.error("[useGetCommands] Error sending message:", error)
      setData({
        favorites: [],
        suggestions: [],
        recents: [],
        deepSearchItems: [],
      })
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
