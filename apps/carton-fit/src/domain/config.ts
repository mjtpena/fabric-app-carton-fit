/**
 * Carton Fit domain constants and thresholds (Day 3.2 spec).
 */

/** Cushion inflation added to EVERY side of a fragile unit (mm). */
export const CUSHION_MM = 20;

/** Corrugated wall thickness added to each side when computing outer dimensions (mm). */
export const WALL_MM = 6;

/** Carrier volumetric divisor (cm³ per kg). 400×300×200 mm outer = 24,000 cm³ ÷ 5000 = 4.8 kg. */
export const DIM_DIVISOR = 5000;

/** Void percentage above which the plan warns and explains why the next smaller carton failed. */
export const VOID_WARN = 40;

/** Fraction of void volume filled by crinkled kraft paper void-fill. */
export const FILL_FACTOR = 0.5;

/** Fractional tolerance between scale weight and computed actual weight before flagging SKUs suspect. */
export const WEIGH_TOLERANCE = 0.05;

/** Supplier lead time (days) used to project carton reorder demand from 7-day average usage. */
export const CARTON_LEAD_DAYS = 5;

/** Window (days) for average daily carton usage. */
export const USAGE_WINDOW_DAYS = 7;

/** Reference parcel carrier rate ($ per billable kg) used with carton unitCost to pick least billable cost. */
export const SHIPPING_RATE_PER_KG = 1.85;
