import { useState, useEffect } from "react";

type ModifierKey = "shift" | "cmd" | "alt" | "ctrl" | null;

export function useIsModifierKeyPressed(): { modifier: ModifierKey } {
  const [modifier, setModifier] = useState<ModifierKey>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.shiftKey) {
        setModifier("shift");
      } else if (e.metaKey) {
        setModifier("cmd");
      } else if (e.altKey) {
        setModifier("alt");
      } else if (e.ctrlKey) {
        setModifier("ctrl");
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (
        (modifier === "shift" && !e.shiftKey) ||
        (modifier === "cmd" && !e.metaKey) ||
        (modifier === "alt" && !e.altKey) ||
        (modifier === "ctrl" && !e.ctrlKey)
      ) {
        setModifier(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [modifier]);

  return {
    modifier,
  };
}
