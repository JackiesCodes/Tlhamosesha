// The poster font library: self-hosted for the app (public/fonts, see
// scripts/copy-font-assets.mjs) and all available on Google Fonts, so exported
// SVG and HTML can link them. Font matching picks from this list.
import type { TextElement } from "./types";

export interface LibraryFont {
  family: string;
  category: TextElement["font"]["category"];
  /** Weights to try when matching (variable fonts can render any in range). */
  weights: number[];
  /** Weight range for a Google Fonts link: "100..900" for variable fonts, else a list. */
  axis: string;
}

const v = (family: string, category: LibraryFont["category"], weights: number[], axis: string): LibraryFont => ({ family, category, weights, axis });

export const FONT_LIBRARY: LibraryFont[] = [
  v("Inter", "sans-serif", [400, 600, 800], "100..900"),
  v("Roboto", "sans-serif", [400, 700, 900], "100..900"),
  v("Open Sans", "sans-serif", [400, 700], "300..800"),
  v("Lato", "sans-serif", [400, 700, 900], "300;400;700;900"),
  v("Poppins", "sans-serif", [400, 600, 800], "300;400;500;600;700;800;900"),
  v("Montserrat", "sans-serif", [400, 700, 900], "100..900"),
  v("Raleway", "sans-serif", [400, 700, 900], "100..900"),
  v("League Spartan", "sans-serif", [400, 700, 900], "100..900"),
  v("Archivo", "sans-serif", [400, 700, 900], "100..900"),
  v("Space Grotesk", "sans-serif", [400, 700], "300..700"),
  v("Archivo Black", "display", [400], "400"),
  v("Oswald", "condensed", [400, 700], "200..700"),
  v("Barlow Condensed", "condensed", [400, 600, 800], "400;500;600;700;800"),
  v("Anton", "condensed", [400], "400"),
  v("Bebas Neue", "display", [400], "400"),
  v("Playfair Display", "serif", [400, 700, 900], "400..900"),
  v("DM Serif Display", "serif", [400], "400"),
  v("Merriweather", "serif", [400, 700, 900], "300..900"),
  v("Roboto Slab", "serif", [400, 700], "100..900"),
  v("Lobster", "script", [400], "400"),
  v("Pacifico", "script", [400], "400"),
  v("JetBrains Mono", "monospace", [400, 700], "100..800"),
];

export const LIBRARY_FAMILIES = FONT_LIBRARY.map((f) => f.family);

/** Google Fonts stylesheet URL for the given families (unknown families are requested plainly). */
export function googleFontsUrl(families: string[]) {
  const spec = families.map((f) => {
    const lib = FONT_LIBRARY.find((x) => x.family === f);
    return `family=${encodeURIComponent(f).replace(/%20/g, "+")}${lib && lib.axis !== "400" ? `:wght@${lib.axis}` : ""}`;
  });
  return `https://fonts.googleapis.com/css2?${spec.join("&")}&display=swap`;
}
