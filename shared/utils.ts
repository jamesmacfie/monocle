import { type ClassValue, clsx } from "clsx"

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// Helper function to lighten a color
export function lightenColor(hex: string, percent: number): string {
  return adjustColor(hex, percent);
}

// Helper function to darken a color
export function darkenColor(hex: string, percent: number): string {
  return adjustColor(hex, -percent);
}

// Helper function to adjust color brightness
export function adjustColor(hex: string, percent: number): string {
  // Make sure hex is a valid color
  if (!hex || typeof hex !== "string") {
    console.warn("Invalid color:", hex);
    return "#37adff"; // Default to blue if invalid
  }

  // Remove # if present
  hex = hex.replace(/^#/, "");

  // If hex doesn't look valid, return default
  if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
    console.warn("Invalid hex color format:", hex);
    return "#37adff";
  }

  try {
    // Parse the hex string into RGB components
    let r = parseInt(hex.substring(0, 2), 16);
    let g = parseInt(hex.substring(2, 4), 16);
    let b = parseInt(hex.substring(4, 6), 16);

    // Adjust the color
    r = Math.min(255, Math.max(0, Math.round(r * (1 + percent / 100))));
    g = Math.min(255, Math.max(0, Math.round(g * (1 + percent / 100))));
    b = Math.min(255, Math.max(0, Math.round(b * (1 + percent / 100))));

    // Convert back to hex
    return `#${r.toString(16).padStart(2, "0")}${g
      .toString(16)
      .padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
  } catch (e) {
    console.error("Error processing color:", hex, e);
    return "#37adff";
  }
}