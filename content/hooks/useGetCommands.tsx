import * as React from "react";
const { useState, useCallback } = React;
import { useSendMessage } from "./useSendMessage";
import type { CommandData } from "../types/command";

export function useGetCommands() {
  const [data, setData] = useState<CommandData>({
    favorites: [],
    suggestions: [],
    recents: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const sendMessage = useSendMessage();

  const fetchCommands = useCallback(async () => {
    console.debug("[useGetCommands] Starting fetchCommands");
    setIsLoading(true);
    try {
      const response = await sendMessage({
        type: "get-commands",
      });
      console.debug("[useGetCommands] Received response:", response);

      if (response.error) {
        console.error("Error fetching suggestions:", response.error);
        setData({
          favorites: [],
          suggestions: [],
          recents: [],
        });
      } else {
        const newData = {
          favorites: response.favorites || [],
          suggestions: response.suggestions || [],
          recents: response.recents || [],
        };
        console.debug("[useGetCommands] Setting data:", newData);
        setData(newData);
      }
    } catch (error) {
      console.error("[useGetCommands] Error sending message:", error);
      setData({
        favorites: [],
        suggestions: [],
        recents: [],
      });
    } finally {
      setIsLoading(false);
    }
  }, [sendMessage]);

  return {
    data,
    isLoading,
    fetchCommands,
  };
}
