/** How long the copy button shows its copied state. Long enough to outlast the sparkle burst. */
export const COPIED_STATE_DURATION_MS = 1400;

/** Sparkles that burst out of the copy button after a successful copy. */
export const SPARKLE_COUNT = 12;
/** Saturated on the light hero, lighter on the dark one, so they read on both. */
export const SPARKLE_COLORS = {
  light: ["#7c3aed", "#8b5cf6", "#a855f7", "#c026d3", "#db2777"],
  dark: ["#a78bfa", "#c4b5fd", "#e879f9", "#f0abfc", "#8b5cf6"],
} as const;
export const SPARKLE_SIZE_PX = { min: 10, max: 18 } as const;
/** How far past the button edge a sparkle travels. */
export const SPARKLE_DISTANCE_PX = { min: 22, max: 46 } as const;
export const SPARKLE_DURATION_MS = { min: 600, max: 850 } as const;
export const SPARKLE_MAX_DELAY_MS = 70;
/** A four-point star in a 24x24 box. */
export const SPARKLE_PATH = "M12 0C12.6 6.6 17.4 11.4 24 12C17.4 12.6 12.6 17.4 12 24C11.4 17.4 6.6 12.6 0 12C6.6 11.4 11.4 6.6 12 0Z";
