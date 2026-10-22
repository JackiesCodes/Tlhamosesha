// Single source of truth for product naming and public contact details.
// Renaming the product later means editing this file (plus logo artwork).
export const BRAND = {
  name: "RevVisual",
  tagline: "Visual Reverse Engineering",
  description:
    "RevVisual breaks posters, banners, flyers, motion-graphic videos and other graphics into their parts — text, images, logos, backgrounds, colours, layout and timing — and rebuilds them as an editable design.",
  /** Shown on the Privacy and Terms pages when set. Leave empty until a support inbox exists. */
  contactEmail: "",
  /** Legal entity shown in the footer and legal pages. Defaults to the product name. */
  operator: "RevVisual",
  /** Last time the Privacy Policy / Terms text changed (ISO date). */
  legalUpdated: "2026-10-22",
} as const;

export const fullTitle = `${BRAND.name} — ${BRAND.tagline}`;
