import type { CommandNode } from "../../../shared/types"
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

export const calculator: CommandNode = {
  type: "group",
  id: "calculator",
  name: "Calculator",
  icon: { type: "lucide", name: "Calculator" },
  color: "teal",
  async children() {
    return [
      {
        type: "input",
        id: "calculator-input",
        name: "Expression",
        field: {
          id: "calculation",
          label: "Expression",
          type: "text",
          placeholder: "1 + 2",
          validation: {
            type: "string",
            // Allow numbers, operators, brakets, other notation, and spaces
            pattern: "[0-9+\\-*/\\s\\(\\)\\^\\%\\|]+",
          },
        },
      },
      {
        type: "input",
        id: "calculator-precision",
        name: "Precision",
        field: {
          id: "precision",
          label: "Decimal Places",
          type: "select",
          options: [
            { value: "0", label: "None (integers)" },
            { value: "2", label: "2 decimal places" },
            { value: "4", label: "4 decimal places" },
            { value: "6", label: "6 decimal places" },
          ],
          defaultValue: "2",
          validation: {
            type: "string",
            enum: ["0", "2", "4", "6"],
          },
        },
      },
      {
        type: "submit",
        id: "calculator-execute",
        name: "Calculate",
        actionLabel: "Calculate",
        async execute(context, values) {
          const activeTab = await getActiveTab()
          if (activeTab) {
            const expression = values?.calculation || ""
            const precision = parseInt(values?.precision || "2", 10)

            if (!expression) {
              return
            }

            try {
              const result = stringMath(expression)
              const formattedResult =
                precision === 0
                  ? Math.round(result).toString()
                  : result.toFixed(precision)

              console.log("result", formattedResult)
              sendTabMessage(activeTab.id, {
                type: "monocle-toast",
                level: "success",
                message: formattedResult,
              })

              if (context?.modifierKey === "cmd") {
                sendTabMessage(activeTab.id, {
                  type: "monocle-copyToClipboard",
                  message: formattedResult,
                })
              }
            } catch (error) {
              sendTabMessage(activeTab.id, {
                type: "monocle-toast",
                level: "error",
                message: "Invalid calculation",
              })
              console.error("Calculation error:", error)
            }
          }
        },
      },
    ]
  },
}
