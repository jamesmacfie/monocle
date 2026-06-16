import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

// Class-name merge helper for the shared shadcn/ui component layer. Combines
// clsx (conditional composition) with tailwind-merge (conflict resolution).
// Promoted from options/lib/cn.ts so content, new-tab, and options can share
// one component layer.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
