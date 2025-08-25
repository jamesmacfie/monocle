import type { AlertEvent, Command } from "../../../types";
import { sendTabMessage } from "../../utils/browser";

function stringMath(eq: string): number {
  const mulDiv =
    /([+-]?\d*\.?\d+(?:e[+-]\d+)?)\s*([*/])\s*([+-]?\d*\.?\d+(?:e[+-]\d+)?)/;
  const plusMin =
    /([+-]?\d*\.?\d+(?:e[+-]\d+)?)\s*([+-])\s*([+-]?\d*\.?\d+(?:e[+-]\d+)?)/;
  const parentheses = /(\d)?\s*\(([^()]*)\)\s*/;
  let current = "";

  while (eq.search(/^\s*([+-]?\d*\.?\d+(?:e[+-]\d+)?)\s*$/) === -1) {
    eq = fParentheses(eq);
    if (eq === current) throw new SyntaxError("The equation is invalid.");
    current = eq;
  }
  return +eq;

  function fParentheses(eq: string): string {
    while (eq.search(parentheses) !== -1) {
      eq = eq.replace(parentheses, function (a, b, c) {
        c = fMulDiv(c);
        c = fPlusMin(c);
        return typeof b === "string" ? b + "*" + c : c;
      });
    }
    eq = fMulDiv(eq);
    eq = fPlusMin(eq);
    return eq;
  }

  function fMulDiv(eq: string): string {
    while (eq.search(mulDiv) !== -1) {
      eq = eq.replace(mulDiv, function (a) {
        const sides = mulDiv.exec(a)!; // Non-null assertion since the regex matched
        const result =
          sides[2] === "*"
            ? Number(sides[1]) * Number(sides[3])
            : Number(sides[1]) / Number(sides[3]);
        return result >= 0 ? "+" + result : String(result);
      });
    }
    return eq;
  }

  function fPlusMin(eq: string): string {
    eq = eq.replace(/([+-])([+-])(\d|\.)/g, function (a, b, c, d) {
      return (b === c ? "+" : "-") + d;
    });
    while (eq.search(plusMin) !== -1) {
      eq = eq.replace(plusMin, function (a) {
        const sides = plusMin.exec(a)!; // Non-null assertion since the regex matched
        const result =
          sides[2] === "+"
            ? Number(sides[1]) + Number(sides[3])
            : Number(sides[1]) - Number(sides[3]);
        return result >= 0 ? "+" + result : String(result);
      });
    }
    return eq;
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
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      const result = stringMath(values?.calculation || "");

      try {
        sendTabMessage(tabs[0].id, {
          type: "monocle-alert",
          level: "success",
          message: result.toString(),
          copyText: result.toString(),
        });

        if (context?.modifierKey === "cmd") {
          sendTabMessage(tabs[0].id, {
            type: "monocle-copyToClipboard",
            message: result.toString(),
          });
        }
      } catch (error) {
        console.error("Error sending message:", error);
      }
    }
  },
};
