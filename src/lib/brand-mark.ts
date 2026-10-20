// The RevVisual mark: two arrows cycling around three panels — taking a design
// apart and building it back up, layer by layer. Rebuilt as exact geometry
// from the supplied artwork (2000-unit square, circle centred at 998,998).
export const MARK_PATH =
  "M129 990A869 869 0 0 1 1650 430L1512 635A627 627 0 0 0 371.1 990L488 990L249 1370L8 990ZM1867 1006A869 869 0 0 1 346 1566L484 1361A627 627 0 0 0 1624.9 1006L1508 1006L1747 626L1988 1006ZM636 795L757 727L757 1246L636 1178ZM824 743L1017.3 636.5Q1047 620 1047 654L1047 1302Q1047 1336 1017.3 1319.5L824 1212ZM1112 673L1364.3 533.3Q1408 509 1408 559L1408 1391Q1408 1441 1364.3 1416.7L1112 1276Z";

/** Square viewBox fitting the mark with a little breathing room. */
export const MARK_VIEWBOX = "-40 -40 2080 2080";
/** Larger square for app-icon tiles (keeps the mark inside platform safe areas). */
export const TILE_VIEWBOX = "-420 -420 2840 2840";
