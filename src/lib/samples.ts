export const SAMPLES = [
  {
    id: "matchday",
    name: "Matchday Semi-Final",
    src: "/samples/matchday.svg",
    category: "Sports Poster",
    size: "1080 × 1350",
    blurb: "Player hero, team badges, fixture details and a sponsor strip.",
  },
  {
    id: "sneaker-ad",
    name: "Airstride Launch",
    src: "/samples/sneaker-ad.svg",
    category: "Product Advertisement",
    size: "1080 × 1080",
    blurb: "Diagonal gradient, hero product, price and call to action.",
  },
  {
    id: "festival-banner",
    name: "Summer Live Banner",
    src: "/samples/festival-banner.svg",
    category: "Event Flyer",
    size: "1600 × 840",
    blurb: "Wide event banner with a three-stop gradient and an icon lock-up.",
  },
] as const;

export type Sample = (typeof SAMPLES)[number];
