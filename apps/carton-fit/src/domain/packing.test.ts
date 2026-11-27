import { describe, expect, it } from 'vitest';

import type { Carton, PackPlan } from '../model';
import { CUSHION_MM, DIM_DIVISOR, WALL_MM } from './config';
import {
  billableWeightGrams,
  cartonDimWeightGrams,
  chooseCarton,
  computeLoadsAbove,
  computeReorderSuggestions,
  dimensionalWeightGrams,
  evaluateWeighIn,
  packOrder,
  serializePlacements,
  parsePlacements,
  type PackUnit,
} from './packing';

function makePrng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const SAMPLE_CARTONS: Carton[] = [
  {
    id: 'c-xs',
    code: 'CF-XS',
    name: 'Small Gift Box',
    innerLength: 200,
    innerWidth: 150,
    innerHeight: 120,
    tareGrams: 120,
    maxLoadGrams: 3000,
    unitCost: 0.45,
    stock: 40,
    reorderPoint: 15,
    active: true,
  },
  {
    id: 'c-s',
    code: 'CF-S',
    name: 'Compact Parcel',
    innerLength: 300,
    innerWidth: 220,
    innerHeight: 160,
    tareGrams: 210,
    maxLoadGrams: 6000,
    unitCost: 0.72,
    stock: 35,
    reorderPoint: 15,
    active: true,
  },
  {
    id: 'c-m',
    code: 'CF-M',
    name: 'Standard Holiday Box',
    innerLength: 388,
    innerWidth: 288,
    innerHeight: 188,
    tareGrams: 310,
    maxLoadGrams: 12000,
    unitCost: 1.05,
    stock: 50,
    reorderPoint: 20,
    active: true,
  },
  {
    id: 'c-l',
    code: 'CF-L',
    name: 'Large Kitchen Box',
    innerLength: 480,
    innerWidth: 360,
    innerHeight: 300,
    tareGrams: 490,
    maxLoadGrams: 18000,
    unitCost: 1.65,
    stock: 25,
    reorderPoint: 12,
    active: true,
  },
];

describe('Carton Fit packing rules', () => {
  it('AC1 (property test): over random orders every plan stays in bounds, has no overlaps, and respects stack limits', () => {
    const rng = makePrng(20261203);
    let testedSuccesses = 0;

    for (let trial = 0; trial < 80; trial++) {
      const unitCount = 1 + Math.floor(rng() * 7);
      const units: PackUnit[] = [];
      for (let i = 0; i < unitCount; i++) {
        const fragile = rng() < 0.22;
        const keepUpright = rng() < 0.3;
        units.push({
          unitIndex: i,
          skuId: `sku-${i}`,
          sku: `SKU-${i}`,
          name: `Item ${i}`,
          length: 50 + Math.floor(rng() * 140),
          width: 45 + Math.floor(rng() * 120),
          height: 40 + Math.floor(rng() * 110),
          weightGrams: 120 + Math.floor(rng() * 1800),
          fragile,
          keepUpright,
          stackLimitGrams: fragile ? 0 : 400 + Math.floor(rng() * 4000),
        });
      }

      const carton = SAMPLE_CARTONS[2 + (trial % 2)]; // M or L
      const res = packOrder(units, carton);
      if (!res) continue;
      testedSuccesses++;

      expect(res.placements).toHaveLength(units.length);

      // Invariant 1: every placement stays inside inner bounds
      for (const p of res.placements) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.z).toBeGreaterThanOrEqual(0);
        expect(p.x + p.dx).toBeLessThanOrEqual(carton.innerLength);
        expect(p.y + p.dy).toBeLessThanOrEqual(carton.innerHeight);
        expect(p.z + p.dz).toBeLessThanOrEqual(carton.innerWidth);
      }

      // Invariant 2: no pairwise 3D overlap
      for (let i = 0; i < res.placements.length; i++) {
        for (let j = i + 1; j < res.placements.length; j++) {
          const a = res.placements[i];
          const b = res.placements[j];
          const sep =
            a.x + a.dx <= b.x ||
            b.x + b.dx <= a.x ||
            a.y + a.dy <= b.y ||
            b.y + b.dy <= a.y ||
            a.z + a.dz <= b.z ||
            b.z + b.dz <= a.z;
          expect(sep).toBe(true);
        }
      }

      // Invariant 3: stack limits and fragile zero-load respected
      const loads = computeLoadsAbove(res.placements);
      for (let i = 0; i < res.placements.length; i++) {
        const p = res.placements[i];
        if (p.fragile) {
          expect(loads[i]).toBe(0);
        }
        expect(loads[i]).toBeLessThanOrEqual(p.stackLimitGrams);
      }
    }

    expect(testedSuccesses).toBeGreaterThan(40);
  });

  it('AC2: a fragile unit never has anything above it, and a keep-upright unit is never laid on its side', () => {
    const units: PackUnit[] = [
      {
        unitIndex: 0,
        skuId: 'ornament',
        sku: 'ORN-GLASS',
        name: 'Blown Glass Ornament',
        length: 90,
        width: 90,
        height: 90,
        weightGrams: 180,
        fragile: true,
        keepUpright: true,
        stackLimitGrams: 0,
      },
      {
        unitIndex: 1,
        skuId: 'kettle',
        sku: 'KTL-COPPER',
        name: 'Copper Stovetop Kettle',
        length: 210,
        width: 190,
        height: 170,
        weightGrams: 1650,
        fragile: false,
        keepUpright: true,
        stackLimitGrams: 3500,
      },
      {
        unitIndex: 2,
        skuId: 'candle',
        sku: 'CND-CEDAR',
        name: 'Cedar Pillar Candle',
        length: 80,
        width: 80,
        height: 145,
        weightGrams: 420,
        fragile: false,
        keepUpright: true,
        stackLimitGrams: 1000,
      },
    ];

    const res = packOrder(units, SAMPLE_CARTONS[3]);
    expect(res).not.toBeNull();
    const loads = computeLoadsAbove(res!.placements);

    for (let i = 0; i < res!.placements.length; i++) {
      const p = res!.placements[i];
      if (p.fragile) {
        expect(loads[i]).toBe(0);
        // Cushion inflation applied on all sides (+40 mm)
        expect(p.dx).toBe(p.rawDx + 2 * CUSHION_MM);
        expect(p.dy).toBe(p.rawDy + 2 * CUSHION_MM);
        expect(p.dz).toBe(p.rawDz + 2 * CUSHION_MM);
      }
      if (p.keepUpright) {
        const orig = units.find((u) => u.unitIndex === p.unitIndex)!;
        expect(p.rawDy).toBe(orig.height);
        expect([0, 1]).toContain(p.rotation);
      }
    }
  });

  it('AC3: a 400 x 300 x 200 mm outer carton shows 4.8 kg dimensional weight; billable is max(actual, dim)', () => {
    const dim = dimensionalWeightGrams(400, 300, 200);
    expect(dim).toBe(4800);
    expect(dim / 1000).toBe(4.8);
    expect(DIM_DIVISOR).toBe(5000);

    // Inner 388x288x188 + 2*WALL_MM (6) = 400x300x200 outer
    expect(WALL_MM).toBe(6);
    expect(cartonDimWeightGrams(SAMPLE_CARTONS[2])).toBe(4800);

    // Lighter actual -> billable = dim
    expect(billableWeightGrams(1900, 4800)).toBe(4800);
    // Heavier actual -> billable = actual
    expect(billableWeightGrams(6200, 4800)).toBe(6200);
  });

  it('AC4: automatic choice costs no more than any other fitting carton; oversized order proposes a two-carton split', () => {
    const smallUnits: PackUnit[] = [
      {
        unitIndex: 0,
        skuId: 's1',
        sku: 'SKU-1',
        name: 'Wool Scarf',
        length: 170,
        width: 120,
        height: 60,
        weightGrams: 280,
        fragile: false,
        keepUpright: false,
        stackLimitGrams: 1500,
      },
    ];
    const choice = chooseCarton(smallUnits, SAMPLE_CARTONS);
    expect(choice.chosen).not.toBeNull();
    for (const cand of choice.candidates.filter((c) => c.fits)) {
      expect(choice.chosen!.totalCost).toBeLessThanOrEqual(cand.totalCost);
    }

    // Oversized order that cannot fit any single carton in SAMPLE_CARTONS -> proposes 2-carton split
    const bigUnits: PackUnit[] = [
      {
        unitIndex: 0,
        skuId: 'b1',
        sku: 'BIG-1',
        name: 'Glass Punch Bowl',
        length: 340,
        width: 300,
        height: 220,
        weightGrams: 2400,
        fragile: true,
        keepUpright: true,
        stackLimitGrams: 0,
      },
      {
        unitIndex: 1,
        skuId: 'b2',
        sku: 'BIG-2',
        name: 'Cast Iron Dutch Oven',
        length: 360,
        width: 280,
        height: 210,
        weightGrams: 5200,
        fragile: false,
        keepUpright: true,
        stackLimitGrams: 8000,
      },
    ];
    const splitChoice = chooseCarton(bigUnits, SAMPLE_CARTONS);
    expect(splitChoice.chosen).toBeNull();
    expect(splitChoice.split).not.toBeNull();
    expect(splitChoice.split!.boxes).toHaveLength(2);
    expect(splitChoice.split!.totalBillableGrams).toBe(
      splitChoice.split!.boxes[0].candidate.billableGrams + splitChoice.split!.boxes[1].candidate.billableGrams,
    );
  });

  it('Rule 4 & 5: weigh-in flags >5% gap and reorder detects low stock or lead-time shortfall', () => {
    expect(evaluateWeighIn(2000, 2080).suspect).toBe(false); // 4%
    expect(evaluateWeighIn(2000, 2120).suspect).toBe(true); // 6%

    const lowCarton: Carton = { ...SAMPLE_CARTONS[0], stock: 10, reorderPoint: 15 };
    const busyCarton: Carton = { ...SAMPLE_CARTONS[1], stock: 18, reorderPoint: 10 };
    const now = new Date('2026-12-10T12:00:00Z');
    const plans: PackPlan[] = Array.from({ length: 28 }, (_, i) => ({
      id: `p-${i}`,
      packOrderId: `o-${i}`,
      cartonId: busyCarton.id,
      boxNo: 1,
      placements: '[]',
      voidPct: 20,
      actualGrams: 1000,
      dimGrams: 1200,
      billableGrams: 1200,
      source: 'auto',
      packerSub: 'demo-user',
      createdAt: new Date(now.getTime() - (i % 6) * 86_400_000).toISOString(),
    }));

    const suggestions = computeReorderSuggestions([lowCarton, busyCarton], plans, now);
    expect(suggestions.map((s) => s.carton.id)).toContain(lowCarton.id);
    // 28 used in 7 days = 4/day * 5 lead days = 20 > stock 18
    expect(suggestions.map((s) => s.carton.id)).toContain(busyCarton.id);

    // Compact placement serialization round-trip
    const pack = packOrder(
      [
        {
          unitIndex: 0,
          skuId: 's1',
          sku: 'S1',
          name: 'Gift',
          length: 100,
          width: 80,
          height: 60,
          weightGrams: 200,
          fragile: false,
          keepUpright: false,
          stackLimitGrams: 1000,
        },
      ],
      SAMPLE_CARTONS[0],
    )!;
    const raw = serializePlacements(pack.placements);
    expect(parsePlacements(raw)).toEqual([[0, 0, 0, 0, pack.placements[0].rotation]]);
  });
});
