// The Decon mark: a single stroke that runs along the top, down the right,
// U-turns along the bottom and returns up the middle as an arrow.
// Traced from the supplied logo artwork (source units, 40-unit stroke).
export const MARK_PATH =
  "M120 49H241A72 72 0 0 1 313 121V193.5A82.5 82.5 0 0 1 148 193.5V181L121 208V148L168 101L215 148V208L188 181V193.5A42.5 42.5 0 0 0 273 193.5V121A32 32 0 0 0 241 89H120Z";

/** Square viewBox with the mark centred and a little breathing room. */
export const MARK_VIEWBOX = "86.5 32.5 260 260";
/** Larger square for app-icon tiles (mark sits within the platform safe area). */
export const TILE_VIEWBOX = "46.5 -7.5 340 340";
