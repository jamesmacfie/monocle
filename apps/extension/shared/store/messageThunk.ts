import { createAsyncThunk } from "@reduxjs/toolkit"
import type { OutboundMessage } from "../types"
import type { ThunkApi } from "./index"

const getError = (response: unknown): string | null => {
  if (
    typeof response !== "object" ||
    response === null ||
    !("error" in response)
  ) {
    return null
  }
  return typeof response.error === "string" && response.error
    ? response.error
    : null
}

/** Shared send, error-envelope, and rejectWithValue contract for store thunks. */
export const createMessageThunk = <Returned, Arg = void, Response = unknown>(
  typePrefix: string,
  build: (arg: Arg) => OutboundMessage,
  map: (response: Response, arg: Arg) => Returned,
  fallbackError: string,
) =>
  createAsyncThunk<Returned, Arg, { extra: ThunkApi; rejectValue: string }>(
    typePrefix,
    async (arg, { extra, rejectWithValue }) => {
      try {
        const response = await extra.sendMessage(build(arg))
        const error = getError(response)
        if (error) {
          return rejectWithValue(error)
        }
        return map(response as Response, arg)
      } catch (error) {
        return rejectWithValue(
          error instanceof Error ? error.message : fallbackError,
        )
      }
    },
  )
