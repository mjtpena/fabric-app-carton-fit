import type { Carton, PackLine, PackPlan, Sku } from '../model';
import {
  CARTON_LEAD_DAYS,
  CUSHION_MM,
  DIM_DIVISOR,
  FILL_FACTOR,
  SHIPPING_RATE_PER_KG,
  USAGE_WINDOW_DAYS,
  VOID_WARN,
  WALL_MM,
  WEIGH_TOLERANCE,
} from './config';

export interface PackUnit {
  unitIndex: number;
  skuId: string;
  sku: string;
  name: string;
  length: number;
  width: number;
  height: number;
  weightGrams: number;
  fragile: boolean;
  keepUpright: boolean;
  stackLimitGrams: number;
  /** Cylinder hint for visual rendering (e.g. candles, mugs, bottles, rolls). */
  isCylinder?: boolean;
}

export interface Placement {
  unitIndex: number;
  skuId: string;
  sku: string;
  name: string;
  /** Inner-box coordinates in mm (x = length, y = vertical height from floor, z = width). */
  x: number;
  y: number;
  z: number;
  /** Oriented effective dimensions in mm (including fragile cushion). */
  dx: number;
  dy: number;
  dz: number;
  /** Raw oriented item dimensions without cushion. */
  rawDx: number;
  rawDy: number;
  rawDz: number;
  /** Rotation index 0..5. For keepUpright units only 0 or 1 are allowed. */
  rotation: number;
  weightGrams: number;
  fragile: boolean;
  keepUpright: boolean;
  stackLimitGrams: number;
  /** Total grams of units resting above this unit's footprint. */
  loadAboveGrams: number;
  isCylinder?: boolean;
}

/** Compact JSON tuple persisted in PackPlan.placements: [unitIndex, x, y, z, rotation]. */
export type CompactPlacement = [number, number, number, number, number];

export interface PackResult {
  placements: Placement[];
  innerVolumeMm3: number;
  usedUnitVolumeMm3: number;
  voidVolumeMm3: number;
  voidPct: number;
  voidFillLitres: number;
  voidWarning: boolean;
}

export interface CartonCandidate {
  carton: Carton;
  fits: boolean;
  reason: string | null;
  pack: PackResult | null;
  actualGrams: number;
  dimGrams: number;
  billableGrams: number;
  totalCost: number;
  outerLength: number;
  outerWidth: number;
  outerHeight: number;
  innerVolumeMm3: number;
}

export interface SplitBoxProposal {
  boxNo: number;
  label: string;
  units: PackUnit[];
  candidate: CartonCandidate;
}

export interface SplitProposal {
  strategy: 'fragile-split' | 'greedy-partition';
  boxes: SplitBoxProposal[];
  totalActualGrams: number;
  totalDimGrams: number;
  totalBillableGrams: number;
  totalCost: number;
}

export interface OrderPlanChoice {
  chosen: CartonCandidate | null;
  split: SplitProposal | null;
  candidates: CartonCandidate[];
  nextSmallerFailure: { carton: Carton; reason: string } | null;
  units: PackUnit[];
}

export interface WeighInResult {
  computedActualGrams: number;
  scaleGrams: number;
  deltaGrams: number;
  gapPct: number;
  suspect: boolean;
}

export interface ReorderSuggestion {
  carton: Carton;
  usedLast7Days: number;
  dailyAvg: number;
  projectedLeadDemand: number;
  belowReorderPoint: boolean;
  belowProjectedDemand: boolean;
  suggestedQty: number;
  estimatedOrderCost: number;
}

export interface AirBillDay {
  day: string;
  plansCount: number;
  actualKg: number;
  dimKg: number;
  billableKg: number;
  airKg: number;
  packerOverrideCount: number;
  overrideExtraCost: number;
}

const CYLINDER_RE = /candle|mug|tumbler|bottle|flask|jar|tube|roll|vase|bauble|ornament|kettle|thermos|lantern/i;

export function isCylinderSku(name: string): boolean {
  return CYLINDER_RE.test(name);
}

export function expandUnits(lines: PackLine[], skuMap: Map<string, Sku>): PackUnit[] {
  const units: PackUnit[] = [];
  let unitIndex = 0;
  for (const line of lines) {
    const sku = skuMap.get(line.skuId);
    if (!sku) continue;
    const count = Math.max(0, Math.floor(line.qty));
    for (let i = 0; i < count; i++) {
      units.push({
        unitIndex: unitIndex++,
        skuId: sku.id,
        sku: sku.sku,
        name: sku.name,
        length: sku.length,
        width: sku.width,
        height: sku.height,
        weightGrams: sku.weightGrams,
        fragile: sku.fragile,
        keepUpright: sku.keepUpright,
        stackLimitGrams: sku.fragile ? 0 : Math.max(0, sku.stackLimitGrams),
        isCylinder: isCylinderSku(sku.name),
      });
    }
  }
  return units;
}

export function outerDimensions(carton: Pick<Carton, 'innerLength' | 'innerWidth' | 'innerHeight'>): {
  outerLength: number;
  outerWidth: number;
  outerHeight: number;
} {
  return {
    outerLength: carton.innerLength + 2 * WALL_MM,
    outerWidth: carton.innerWidth + 2 * WALL_MM,
    outerHeight: carton.innerHeight + 2 * WALL_MM,
  };
}

/**
 * Dimensional weight in grams from outer dimensions in mm.
 * Outer L×W×H in cm³ ÷ 5000 kg = (L×W×H in mm³ / 1000 / 5000) * 1000 g = (L×W×H) / DIM_DIVISOR g.
 */
export function dimensionalWeightGrams(outerLengthMm: number, outerWidthMm: number, outerHeightMm: number): number {
  return Math.round((outerLengthMm * outerWidthMm * outerHeightMm) / DIM_DIVISOR);
}

export function cartonDimWeightGrams(carton: Pick<Carton, 'innerLength' | 'innerWidth' | 'innerHeight'>): number {
  const { outerLength, outerWidth, outerHeight } = outerDimensions(carton);
  return dimensionalWeightGrams(outerLength, outerWidth, outerHeight);
}

export function billableWeightGrams(actualGrams: number, dimGrams: number): number {
  return Math.max(actualGrams, dimGrams);
}

export function billableCost(carton: Pick<Carton, 'unitCost'>, billableGrams: number): number {
  return Number((carton.unitCost + (billableGrams / 1000) * SHIPPING_RATE_PER_KG).toFixed(2));
}

/**
 * Six axis-aligned orientations [dx, dy, dz] where dy is vertical height.
 * Rotations 0 and 1 keep `height` vertical (required for keepUpright units).
 */
export function allowedRotations(unit: Pick<PackUnit, 'length' | 'width' | 'height' | 'keepUpright' | 'fragile'>): Array<{
  rotation: number;
  dx: number;
  dy: number;
  dz: number;
  rawDx: number;
  rawDy: number;
  rawDz: number;
}> {
  const pad = unit.fragile ? 2 * CUSHION_MM : 0;
  const L = unit.length;
  const W = unit.width;
  const H = unit.height;
  const all: Array<[number, number, number, number]> = [
    [0, L, H, W],
    [1, W, H, L],
    [2, L, W, H],
    [3, W, L, H],
    [4, H, L, W],
    [5, H, W, L],
  ];
  const subset = unit.keepUpright ? all.slice(0, 2) : all;
  const seen = new Set<string>();
  const out: Array<{
    rotation: number;
    dx: number;
    dy: number;
    dz: number;
    rawDx: number;
    rawDy: number;
    rawDz: number;
  }> = [];
  for (const [rotation, rawDx, rawDy, rawDz] of subset) {
    const key = `${rawDx}x${rawDy}x${rawDz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      rotation,
      dx: rawDx + pad,
      dy: rawDy + pad,
      dz: rawDz + pad,
      rawDx,
      rawDy,
      rawDz,
    });
  }
  return out;
}

function overlaps2D(ax: number, adx: number, az: number, adz: number, bx: number, bdx: number, bz: number, bdz: number): boolean {
  return ax < bx + bdx && bx < ax + adx && az < bz + bdz && bz < az + adz;
}

function overlaps3D(
  ax: number,
  ay: number,
  az: number,
  adx: number,
  ady: number,
  adz: number,
  bx: number,
  by: number,
  bz: number,
  bdx: number,
  bdy: number,
  bdz: number,
): boolean {
  return (
    ax < bx + bdx &&
    bx < ax + adx &&
    ay < by + bdy &&
    by < ay + ady &&
    az < bz + bdz &&
    bz < az + adz
  );
}

/**
 * Recomputes conservative vertical load above every placement:
 * the sum of weights of all placements at or above p's top face whose (x, z) footprint overlaps p.
 */
export function computeLoadsAbove(placements: Placement[]): number[] {
  const loads = new Array<number>(placements.length).fill(0);
  for (let i = 0; i < placements.length; i++) {
    const lower = placements[i];
    const lowerTop = lower.y + lower.dy;
    let total = 0;
    for (let j = 0; j < placements.length; j++) {
      if (i === j) continue;
      const upper = placements[j];
      if (upper.y >= lowerTop && overlaps2D(lower.x, lower.dx, lower.z, lower.dz, upper.x, upper.dx, upper.z, upper.dz)) {
        total += upper.weightGrams;
      }
    }
    loads[i] = total;
  }
  return loads;
}

/**
 * Rule 1: Pure 3D first-fit-decreasing extreme-point packer.
 * - Inflates fragile units by CUSHION_MM (20 mm) on every side.
 * - Sorts by effective volume descending (tie-break: non-fragile first, then heavier first, then unitIndex).
 * - Places each unit at the lowest extreme point where it fits in an allowed rotation.
 * - Enforces: in-bounds, no overlap, gravity support, no load above fragile units, and stackLimitGrams.
 */
export function packOrder(
  units: PackUnit[],
  carton: Pick<Carton, 'innerLength' | 'innerWidth' | 'innerHeight'>,
): PackResult | null {
  const innerVolumeMm3 = carton.innerLength * carton.innerWidth * carton.innerHeight;
  if (innerVolumeMm3 <= 0) return null;

  if (units.length === 0) {
    return {
      placements: [],
      innerVolumeMm3,
      usedUnitVolumeMm3: 0,
      voidVolumeMm3: innerVolumeMm3,
      voidPct: 100,
      voidFillLitres: Number(((innerVolumeMm3 / 1_000_000) * FILL_FACTOR).toFixed(2)),
      voidWarning: true,
    };
  }

  // Sort by effective volume descending; for equal volume place sturdy/heavier items before fragile ones
  const sorted = [...units].sort((a, b) => {
    const padA = a.fragile ? 2 * CUSHION_MM : 0;
    const padB = b.fragile ? 2 * CUSHION_MM : 0;
    const volA = (a.length + padA) * (a.width + padA) * (a.height + padA);
    const volB = (b.length + padB) * (b.width + padB) * (b.height + padB);
    if (volB !== volA) return volB - volA;
    if (a.fragile !== b.fragile) return a.fragile ? 1 : -1;
    if (b.weightGrams !== a.weightGrams) return b.weightGrams - a.weightGrams;
    return a.unitIndex - b.unitIndex;
  });

  const placements: Placement[] = [];
  let extremePoints: Array<{ x: number; y: number; z: number }> = [{ x: 0, y: 0, z: 0 }];

  for (const unit of sorted) {
    const rots = allowedRotations(unit);
    // Sort extreme points lowest y first, then x, then z
    extremePoints.sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z);

    let placed: Placement | null = null;

    for (const pt of extremePoints) {
      for (const rot of rots) {
        // 1. In bounds
        if (
          pt.x < 0 ||
          pt.y < 0 ||
          pt.z < 0 ||
          pt.x + rot.dx > carton.innerLength ||
          pt.y + rot.dy > carton.innerHeight ||
          pt.z + rot.dz > carton.innerWidth
        ) {
          continue;
        }

        // 2. No overlap with existing placements
        let collides = false;
        for (const p of placements) {
          if (overlaps3D(pt.x, pt.y, pt.z, rot.dx, rot.dy, rot.dz, p.x, p.y, p.z, p.dx, p.dy, p.dz)) {
            collides = true;
            break;
          }
        }
        if (collides) continue;

        // 3. Support check if above floor: must sit on at least one existing placement
        if (pt.y > 0) {
          let supported = false;
          for (const p of placements) {
            if (p.y + p.dy === pt.y && overlaps2D(pt.x, rot.dx, pt.z, rot.dz, p.x, p.dx, p.z, p.dz)) {
              supported = true;
              break;
            }
          }
          if (!supported) continue;
        }

        // 4. Fragile and stackLimit check across ALL placements (both existing ones below us, and if we're under anything)
        const candidate: Placement = {
          unitIndex: unit.unitIndex,
          skuId: unit.skuId,
          sku: unit.sku,
          name: unit.name,
          x: pt.x,
          y: pt.y,
          z: pt.z,
          dx: rot.dx,
          dy: rot.dy,
          dz: rot.dz,
          rawDx: rot.rawDx,
          rawDy: rot.rawDy,
          rawDz: rot.rawDz,
          rotation: rot.rotation,
          weightGrams: unit.weightGrams,
          fragile: unit.fragile,
          keepUpright: unit.keepUpright,
          stackLimitGrams: unit.fragile ? 0 : unit.stackLimitGrams,
          loadAboveGrams: 0,
          isCylinder: unit.isCylinder,
        };

        const trial = [...placements, candidate];
        const loads = computeLoadsAbove(trial);
        let stackOk = true;
        for (let i = 0; i < trial.length; i++) {
          if (trial[i].fragile && loads[i] > 0) {
            stackOk = false;
            break;
          }
          if (loads[i] > trial[i].stackLimitGrams) {
            stackOk = false;
            break;
          }
        }
        if (!stackOk) continue;

        placed = candidate;
        break;
      }
      if (placed) break;
    }

    if (!placed) return null;

    placements.push(placed);

    // Add new extreme points from placed item
    const nextPts = [
      { x: placed.x + placed.dx, y: placed.y, z: placed.z },
      { x: placed.x, y: placed.y + placed.dy, z: placed.z },
      { x: placed.x, y: placed.y, z: placed.z + placed.dz },
    ];
    // Also project onto floor (y=0) for x+dx and z+dz so subsequent items can settle low
    if (placed.y > 0) {
      nextPts.push(
        { x: placed.x + placed.dx, y: 0, z: placed.z },
        { x: placed.x, y: 0, z: placed.z + placed.dz },
      );
    }

    const seen = new Set(extremePoints.map((p) => `${p.x},${p.y},${p.z}`));
    for (const np of nextPts) {
      if (np.x >= carton.innerLength || np.y >= carton.innerHeight || np.z >= carton.innerWidth) continue;
      const key = `${np.x},${np.y},${np.z}`;
      if (!seen.has(key)) {
        seen.add(key);
        extremePoints.push(np);
      }
    }
    // Remove exact occupied origin point
    extremePoints = extremePoints.filter((p) => !(p.x === placed!.x && p.y === placed!.y && p.z === placed!.z));
  }

  // Finalise loadAboveGrams on every placement
  const finalLoads = computeLoadsAbove(placements);
  for (let i = 0; i < placements.length; i++) {
    placements[i].loadAboveGrams = finalLoads[i];
  }

  const usedUnitVolumeMm3 = units.reduce((acc, u) => acc + u.length * u.width * u.height, 0);
  const voidVolumeMm3 = Math.max(0, innerVolumeMm3 - usedUnitVolumeMm3);
  const voidPct = Number(((voidVolumeMm3 / innerVolumeMm3) * 100).toFixed(1));
  const voidFillLitres = Number(((voidVolumeMm3 / 1_000_000) * FILL_FACTOR).toFixed(2));

  return {
    placements,
    innerVolumeMm3,
    usedUnitVolumeMm3,
    voidVolumeMm3,
    voidPct,
    voidFillLitres,
    voidWarning: voidPct > VOID_WARN,
  };
}

export function evaluateCarton(units: PackUnit[], carton: Carton): CartonCandidate {
  const { outerLength, outerWidth, outerHeight } = outerDimensions(carton);
  const innerVolumeMm3 = carton.innerLength * carton.innerWidth * carton.innerHeight;
  const itemsWeightGrams = units.reduce((acc, u) => acc + u.weightGrams, 0);
  const actualGrams = carton.tareGrams + itemsWeightGrams;
  const dimGrams = dimensionalWeightGrams(outerLength, outerWidth, outerHeight);
  const billableGrams = billableWeightGrams(actualGrams, dimGrams);
  const totalCost = billableCost(carton, billableGrams);

  if (!carton.active) {
    return {
      carton,
      fits: false,
      reason: 'Carton inactive',
      pack: null,
      actualGrams,
      dimGrams,
      billableGrams,
      totalCost,
      outerLength,
      outerWidth,
      outerHeight,
      innerVolumeMm3,
    };
  }
  if (carton.stock <= 0) {
    return {
      carton,
      fits: false,
      reason: 'Out of stock',
      pack: null,
      actualGrams,
      dimGrams,
      billableGrams,
      totalCost,
      outerLength,
      outerWidth,
      outerHeight,
      innerVolumeMm3,
    };
  }
  if (itemsWeightGrams > carton.maxLoadGrams) {
    return {
      carton,
      fits: false,
      reason: `Load ${(itemsWeightGrams / 1000).toFixed(2)} kg exceeds ${(carton.maxLoadGrams / 1000).toFixed(1)} kg limit`,
      pack: null,
      actualGrams,
      dimGrams,
      billableGrams,
      totalCost,
      outerLength,
      outerWidth,
      outerHeight,
      innerVolumeMm3,
    };
  }

  const pack = packOrder(units, carton);
  if (!pack) {
    const hasFragile = units.some((u) => u.fragile);
    const hasUpright = units.some((u) => u.keepUpright);
    let reason = 'Items exceed inner dimensions';
    if (hasFragile && units.some((u) => u.fragile && u.height + 2 * CUSHION_MM > carton.innerHeight)) {
      reason = 'Fragile cushion exceeds carton height';
    } else if (hasUpright && units.some((u) => u.keepUpright && u.height > carton.innerHeight)) {
      reason = 'Keep-upright item taller than carton';
    } else if (hasFragile) {
      reason = 'Cannot fit without stacking on fragile item';
    }
    return {
      carton,
      fits: false,
      reason,
      pack: null,
      actualGrams,
      dimGrams,
      billableGrams,
      totalCost,
      outerLength,
      outerWidth,
      outerHeight,
      innerVolumeMm3,
    };
  }

  return {
    carton,
    fits: true,
    reason: null,
    pack,
    actualGrams,
    dimGrams,
    billableGrams,
    totalCost,
    outerLength,
    outerWidth,
    outerHeight,
    innerVolumeMm3,
  };
}

function pickBestSingle(units: PackUnit[], cartons: Carton[]): CartonCandidate | null {
  const evaluated = cartons.map((c) => evaluateCarton(units, c)).filter((c) => c.fits);
  if (evaluated.length === 0) return null;
  evaluated.sort((a, b) => a.totalCost - b.totalCost || a.innerVolumeMm3 - b.innerVolumeMm3 || a.carton.code.localeCompare(b.carton.code));
  return evaluated[0];
}

function tryTwoCartonSplit(units: PackUnit[], cartons: Carton[]): SplitProposal | null {
  if (units.length < 2) return null;

  const proposals: SplitProposal[] = [];

  const evaluatePartition = (
    strategy: SplitProposal['strategy'],
    groupA: PackUnit[],
    labelA: string,
    groupB: PackUnit[],
    labelB: string,
  ) => {
    if (groupA.length === 0 || groupB.length === 0) return;
    const bestA = pickBestSingle(groupA, cartons);
    if (!bestA) return;
    // Account for stock if both boxes use the same carton
    const remainingCartons = cartons.map((c) =>
      c.id === bestA.carton.id ? { ...c, stock: Math.max(0, c.stock - 1) } : c,
    );
    const bestB = pickBestSingle(groupB, remainingCartons);
    if (!bestB) return;

    proposals.push({
      strategy,
      boxes: [
        { boxNo: 1, label: labelA, units: groupA, candidate: bestA },
        { boxNo: 2, label: labelB, units: groupB, candidate: bestB },
      ],
      totalActualGrams: bestA.actualGrams + bestB.actualGrams,
      totalDimGrams: bestA.dimGrams + bestB.dimGrams,
      totalBillableGrams: bestA.billableGrams + bestB.billableGrams,
      totalCost: Number((bestA.totalCost + bestB.totalCost).toFixed(2)),
    });
  };

  // Strategy 1: Fragile units vs the rest first
  const fragileUnits = units.filter((u) => u.fragile);
  const sturdyUnits = units.filter((u) => !u.fragile);
  if (fragileUnits.length > 0 && sturdyUnits.length > 0) {
    evaluatePartition('fragile-split', fragileUnits, 'Fragile box', sturdyUnits, 'Standard box');
  }

  // Strategy 2: Greedy volume-balanced partition (descending effective volume)
  const sorted = [...units].sort((a, b) => {
    const va = a.length * a.width * a.height;
    const vb = b.length * b.width * b.height;
    return vb - va || b.weightGrams - a.weightGrams;
  });
  const binA: PackUnit[] = [];
  const binB: PackUnit[] = [];
  let volA = 0;
  let volB = 0;
  for (const u of sorted) {
    const v = u.length * u.width * u.height;
    if (volA <= volB) {
      binA.push(u);
      volA += v;
    } else {
      binB.push(u);
      volB += v;
    }
  }
  evaluatePartition('greedy-partition', binA, 'Box 1', binB, 'Box 2');

  if (proposals.length === 0) return null;
  proposals.sort((a, b) => a.totalCost - b.totalCost || a.totalBillableGrams - b.totalBillableGrams);
  return proposals[0];
}

/**
 * Rules 2 & 3: Evaluate all cartons, pick least billable cost (ties on smaller volume),
 * explain next smaller failing carton when void > VOID_WARN, or propose a two-carton split.
 */
export function chooseCarton(units: PackUnit[], cartons: Carton[]): OrderPlanChoice {
  const candidates = cartons
    .map((c) => evaluateCarton(units, c))
    .sort((a, b) => a.innerVolumeMm3 - b.innerVolumeMm3 || a.carton.code.localeCompare(b.carton.code));

  const fitting = candidates.filter((c) => c.fits);
  fitting.sort((a, b) => a.totalCost - b.totalCost || a.innerVolumeMm3 - b.innerVolumeMm3);

  const chosen = fitting[0] ?? null;
  let nextSmallerFailure: { carton: Carton; reason: string } | null = null;

  if (chosen) {
    const smallerFailed = candidates
      .filter((c) => !c.fits && c.carton.active && c.innerVolumeMm3 < chosen.innerVolumeMm3)
      .sort((a, b) => b.innerVolumeMm3 - a.innerVolumeMm3);
    if (smallerFailed.length > 0) {
      nextSmallerFailure = {
        carton: smallerFailed[0].carton,
        reason: smallerFailed[0].reason ?? 'Does not fit',
      };
    }
  }

  const split = chosen ? null : tryTwoCartonSplit(units, cartons);

  return {
    chosen,
    split,
    candidates,
    nextSmallerFailure,
    units,
  };
}

export function serializePlacements(placements: Placement[]): string {
  const compact: CompactPlacement[] = placements.map((p) => [p.unitIndex, p.x, p.y, p.z, p.rotation]);
  return JSON.stringify(compact);
}

export function parsePlacements(json: string): CompactPlacement[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is CompactPlacement =>
        Array.isArray(row) && row.length === 5 && row.every((n) => typeof n === 'number' && Number.isFinite(n)),
    );
  } catch {
    return [];
  }
}

/**
 * Rule 4: Weigh-in tolerance check. Gap > 5% flags SKUs as suspect.
 */
export function evaluateWeighIn(computedActualGrams: number, scaleGrams: number): WeighInResult {
  const deltaGrams = scaleGrams - computedActualGrams;
  const gapPct = computedActualGrams > 0 ? Math.abs(deltaGrams) / computedActualGrams : 0;
  return {
    computedActualGrams,
    scaleGrams,
    deltaGrams,
    gapPct,
    suspect: gapPct > WEIGH_TOLERANCE,
  };
}

/**
 * Rule 5: Reorder suggestions from stock <= reorderPoint or stock < 7-day avg × lead days.
 */
export function computeReorderSuggestions(cartons: Carton[], plans: PackPlan[], now: Date): ReorderSuggestion[] {
  const cutoffMs = now.getTime() - USAGE_WINDOW_DAYS * 86_400_000;
  const usageByCarton = new Map<string, number>();

  for (const plan of plans) {
    const ts = new Date(plan.createdAt).getTime();
    if (ts >= cutoffMs && ts <= now.getTime() + 86_400_000) {
      usageByCarton.set(plan.cartonId, (usageByCarton.get(plan.cartonId) ?? 0) + 1);
    }
  }

  const suggestions: ReorderSuggestion[] = [];
  for (const carton of cartons) {
    if (!carton.active) continue;
    const usedLast7Days = usageByCarton.get(carton.id) ?? 0;
    const dailyAvg = Number((usedLast7Days / USAGE_WINDOW_DAYS).toFixed(2));
    const projectedLeadDemand = Math.ceil(dailyAvg * CARTON_LEAD_DAYS);
    const belowReorderPoint = carton.stock <= carton.reorderPoint;
    const belowProjectedDemand = projectedLeadDemand > 0 && carton.stock < projectedLeadDemand;

    if (belowReorderPoint || belowProjectedDemand) {
      const target = Math.max(carton.reorderPoint * 2, projectedLeadDemand * 2, 20);
      const suggestedQty = Math.max(10, target - carton.stock);
      suggestions.push({
        carton,
        usedLast7Days,
        dailyAvg,
        projectedLeadDemand,
        belowReorderPoint,
        belowProjectedDemand,
        suggestedQty,
        estimatedOrderCost: Number((suggestedQty * carton.unitCost).toFixed(2)),
      });
    }
  }

  return suggestions.sort((a, b) => a.carton.stock - b.carton.stock || a.carton.code.localeCompare(b.carton.code));
}

export function computeAirBill(
  plans: PackPlan[],
  cartonMap: Map<string, Carton>,
  linesByOrder: Map<string, PackLine[]>,
  skuMap: Map<string, Sku>,
  allCartons: Carton[],
): {
  days: AirBillDay[];
  totalAirKg: number;
  totalBillableKg: number;
  totalActualKg: number;
  overrideCount: number;
  totalOverrideExtraCost: number;
  overrideOrderIds: Set<string>;
} {
  const byDay = new Map<string, AirBillDay>();
  let totalAirGrams = 0;
  let totalBillableGrams = 0;
  let totalActualGrams = 0;
  let overrideCount = 0;
  let totalOverrideExtraCost = 0;
  const overrideOrderIds = new Set<string>();

  for (const plan of plans) {
    const day = plan.createdAt.slice(0, 10);
    const entry = byDay.get(day) ?? {
      day,
      plansCount: 0,
      actualKg: 0,
      dimKg: 0,
      billableKg: 0,
      airKg: 0,
      packerOverrideCount: 0,
      overrideExtraCost: 0,
    };

    const airGrams = Math.max(0, plan.billableGrams - plan.actualGrams);
    entry.plansCount += 1;
    entry.actualKg += plan.actualGrams / 1000;
    entry.dimKg += plan.dimGrams / 1000;
    entry.billableKg += plan.billableGrams / 1000;
    entry.airKg += airGrams / 1000;

    totalAirGrams += airGrams;
    totalBillableGrams += plan.billableGrams;
    totalActualGrams += plan.actualGrams;

    if (plan.source === 'packer') {
      const usedCarton = cartonMap.get(plan.cartonId);
      const lines = linesByOrder.get(plan.packOrderId) ?? [];
      const units = expandUnits(lines, skuMap);
      const auto = chooseCarton(units, allCartons);
      if (usedCarton && auto.chosen) {
        const usedCost = billableCost(usedCarton, plan.billableGrams);
        const diff = Number((usedCost - auto.chosen.totalCost).toFixed(2));
        if (diff > 0.01) {
          entry.packerOverrideCount += 1;
          entry.overrideExtraCost = Number((entry.overrideExtraCost + diff).toFixed(2));
          overrideCount += 1;
          totalOverrideExtraCost = Number((totalOverrideExtraCost + diff).toFixed(2));
          overrideOrderIds.add(plan.packOrderId);
        }
      }
    }

    byDay.set(day, entry);
  }

  const days = [...byDay.values()]
    .map((d) => ({
      ...d,
      actualKg: Number(d.actualKg.toFixed(2)),
      dimKg: Number(d.dimKg.toFixed(2)),
      billableKg: Number(d.billableKg.toFixed(2)),
      airKg: Number(d.airKg.toFixed(2)),
    }))
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    days,
    totalAirKg: Number((totalAirGrams / 1000).toFixed(2)),
    totalBillableKg: Number((totalBillableGrams / 1000).toFixed(2)),
    totalActualKg: Number((totalActualGrams / 1000).toFixed(2)),
    overrideCount,
    totalOverrideExtraCost,
    overrideOrderIds,
  };
}

export function hydratePlacementsFromPlan(
  plan: PackPlan,
  lines: PackLine[],
  skuMap: Map<string, Sku>,
): Placement[] {
  const units = expandUnits(lines, skuMap);
  const byIndex = new Map(units.map((u) => [u.unitIndex, u]));
  const compact = parsePlacements(plan.placements);
  const placements: Placement[] = [];

  for (const [unitIndex, x, y, z, rotation] of compact) {
    const unit = byIndex.get(unitIndex);
    if (!unit) continue;
    const rots = allowedRotations({ ...unit, keepUpright: false });
    const rot = rots.find((r) => r.rotation === rotation) ?? rots[0];
    placements.push({
      unitIndex: unit.unitIndex,
      skuId: unit.skuId,
      sku: unit.sku,
      name: unit.name,
      x,
      y,
      z,
      dx: rot.dx,
      dy: rot.dy,
      dz: rot.dz,
      rawDx: rot.rawDx,
      rawDy: rot.rawDy,
      rawDz: rot.rawDz,
      rotation: rot.rotation,
      weightGrams: unit.weightGrams,
      fragile: unit.fragile,
      keepUpright: unit.keepUpright,
      stackLimitGrams: unit.stackLimitGrams,
      loadAboveGrams: 0,
      isCylinder: unit.isCylinder,
    });
  }

  const loads = computeLoadsAbove(placements);
  for (let i = 0; i < placements.length; i++) {
    placements[i].loadAboveGrams = loads[i];
  }
  return placements;
}
