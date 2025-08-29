import type { Command } from "../../../types"
import { getActiveTab, sendTabMessage } from "../../utils/browser"

function stringMath(eq: string): number {
  const mulDiv =
    /([+-]?\d*\.?\d+(?:e[+-]\d+)?)\s*([*/])\s*([+-]?\d*\.?\d+(?:e[+-]\d+)?)/
  const plusMin =
    /([+-]?\d*\.?\d+(?:e[+-]\d+)?)\s*([+-])\s*([+-]?\d*\.?\d+(?:e[+-]\d+)?)/
  const parentheses = /(\d)?\s*\(([^()]*)\)\s*/
  let current = ""

  while (eq.search(/^\s*([+-]?\d*\.?\d+(?:e[+-]\d+)?)\s*$/) === -1) {
    eq = fParentheses(eq)
    if (eq === current) throw new SyntaxError("The equation is invalid.")
    current = eq
  }
  return +eq

  function fParentheses(eq: string): string {
    while (eq.search(parentheses) !== -1) {
      eq = eq.replace(parentheses, (_a, b, c) => {
        c = fMulDiv(c)
        c = fPlusMin(c)
        return typeof b === "string" ? `${b}*${c}` : c
      })
    }
    eq = fMulDiv(eq)
    eq = fPlusMin(eq)
    return eq
  }

  function fMulDiv(eq: string): string {
    while (eq.search(mulDiv) !== -1) {
      eq = eq.replace(mulDiv, (a) => {
        const sides = mulDiv.exec(a)! // Non-null assertion since the regex matched
        const result =
          sides[2] === "*"
            ? Number(sides[1]) * Number(sides[3])
            : Number(sides[1]) / Number(sides[3])
        return result >= 0 ? `+${result}` : String(result)
      })
    }
    return eq
  }

  function fPlusMin(eq: string): string {
    eq = eq.replace(
      /([+-])([+-])(\d|\.)/g,
      (_a, b, c, d) => (b === c ? "+" : "-") + d,
    )
    while (eq.search(plusMin) !== -1) {
      eq = eq.replace(plusMin, (a) => {
        const sides = plusMin.exec(a)! // Non-null assertion since the regex matched
        const result =
          sides[2] === "+"
            ? Number(sides[1]) + Number(sides[3])
            : Number(sides[1]) - Number(sides[3])
        return result >= 0 ? `+${result}` : String(result)
      })
    }
    return eq
  }
}

export const calculator: Command = {
  id: "calculator",
  name: "Calculator",
  icon: { name: "Calculator" },
  color: "teal",
  ui: [
    {
      id: "calculation",
      type: "input",
      placeholder: "1 + 2",
    },
  ],
  actionLabel: "Answer",
  modifierActionLabel: {
    cmd: "Copy Answer",
  },
  run: async (context, values) => {
    const activeTab = await getActiveTab()

    console.log({ activeTab })
    if (activeTab) {
      const result = stringMath(values?.calculation || "")

      try {
        sendTabMessage(activeTab.id, {
          type: "monocle-alert",
          level: "success",
          message: result.toString(),
          copyText: result.toString(),
        })

        if (context?.modifierKey === "cmd") {
          sendTabMessage(activeTab.id, {
            type: "monocle-copyToClipboard",
            message: result.toString(),
          })
        }
      } catch (error) {
        console.error("Error sending message:", error)
      }
    }
  },
}
