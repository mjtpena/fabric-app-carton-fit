import type { DataStore } from '@x10/shared/data';
import type { SeedContext } from '@x10/shared/runtime';

import { chooseCarton, expandUnits, serializePlacements } from './domain/packing';
import type { Carton, PackLine, PackOrder, Schema, Sku } from './model';

function createRng(seedValue: number) {
  let s = seedValue >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const CARTON_CATALOG: Array<Omit<Carton, 'id'>> = [
  { code: 'CF-FLT', name: 'Flat Gift Mailer', innerLength: 290, innerWidth: 220, innerHeight: 55, tareGrams: 95, maxLoadGrams: 2200, unitCost: 0.42, stock: 68, reorderPoint: 20, active: true },
  { code: 'CF-XS', name: 'Small Keepsake Box', innerLength: 210, innerWidth: 160, innerHeight: 120, tareGrams: 130, maxLoadGrams: 3500, unitCost: 0.48, stock: 54, reorderPoint: 18, active: true },
  { code: 'CF-S', name: 'Compact Parcel', innerLength: 290, innerWidth: 210, innerHeight: 155, tareGrams: 195, maxLoadGrams: 6000, unitCost: 0.68, stock: 12, reorderPoint: 20, active: true }, // Below reorder #1
  { code: 'CF-SQ', name: 'Cube Ornament Box', innerLength: 240, innerWidth: 240, innerHeight: 220, tareGrams: 220, maxLoadGrams: 7500, unitCost: 0.78, stock: 42, reorderPoint: 15, active: true },
  { code: 'CF-TUB', name: 'Poster & Wrap Tube', innerLength: 540, innerWidth: 110, innerHeight: 110, tareGrams: 185, maxLoadGrams: 4000, unitCost: 0.85, stock: 31, reorderPoint: 12, active: true },
  { code: 'CF-M', name: 'Standard Bench Box', innerLength: 388, innerWidth: 288, innerHeight: 188, tareGrams: 310, maxLoadGrams: 12000, unitCost: 1.05, stock: 14, reorderPoint: 22, active: true }, // Below reorder #2 (400×300×200 outer = 4.8 kg dim)
  { code: 'CF-MD', name: 'Deep Pantry Carton', innerLength: 360, innerWidth: 280, innerHeight: 260, tareGrams: 360, maxLoadGrams: 14000, unitCost: 1.24, stock: 46, reorderPoint: 16, active: true },
  { code: 'CF-W', name: 'Wide Linen Box', innerLength: 450, innerWidth: 340, innerHeight: 180, tareGrams: 380, maxLoadGrams: 13000, unitCost: 1.32, stock: 39, reorderPoint: 14, active: true },
  { code: 'CF-L', name: 'Large Kitchen Carton', innerLength: 480, innerWidth: 360, innerHeight: 290, tareGrams: 490, maxLoadGrams: 18000, unitCost: 1.68, stock: 34, reorderPoint: 12, active: true },
  { code: 'CF-LT', name: 'Tall Appliance Box', innerLength: 420, innerWidth: 360, innerHeight: 350, tareGrams: 520, maxLoadGrams: 20000, unitCost: 1.85, stock: 26, reorderPoint: 10, active: true },
  { code: 'CF-XL', name: 'Extra-Large Hamper', innerLength: 560, innerWidth: 410, innerHeight: 330, tareGrams: 640, maxLoadGrams: 24000, unitCost: 2.25, stock: 22, reorderPoint: 8, active: true },
  { code: 'CF-HD', name: 'Heavy Double-Wall XL', innerLength: 580, innerWidth: 430, innerHeight: 360, tareGrams: 780, maxLoadGrams: 30000, unitCost: 2.75, stock: 19, reorderPoint: 8, active: true },
];

const SKU_ADJECTIVES = [
  'Nordic', 'Cedar', 'Copper', 'Birch', 'Amber', 'Solstice', 'Linen', 'Hearth', 'Spruce', 'Oatmeal',
];

const SKU_TEMPLATES: Array<{
  prefix: string;
  noun: string;
  l: number;
  w: number;
  h: number;
  g: number;
  fragile: boolean;
  upright: boolean;
  stack: number;
}> = [
  { prefix: 'ORN', noun: 'Blown Glass Ornament Set', l: 130, w: 130, h: 105, g: 240, fragile: true, upright: true, stack: 0 },
  { prefix: 'KTL', noun: 'Stovetop Kettle', l: 225, w: 205, h: 175, g: 1680, fragile: false, upright: true, stack: 4500 },
  { prefix: 'CND', noun: 'Beeswax Pillar Candle', l: 88, w: 88, h: 145, g: 460, fragile: false, upright: true, stack: 1200 },
  { prefix: 'MUG', noun: 'Stoneware Cocoa Mug Pair', l: 190, w: 105, h: 110, g: 640, fragile: true, upright: true, stack: 0 },
  { prefix: 'THR', noun: 'Merino Woven Throw', l: 260, w: 195, h: 85, g: 820, fragile: false, upright: false, stack: 2500 },
  { prefix: 'TIN', noun: 'Shortbread Biscuit Tin', l: 215, w: 155, h: 72, g: 710, fragile: false, upright: true, stack: 3200 },
  { prefix: 'BOK', noun: 'Hardcover Baking Almanac', l: 245, w: 190, h: 32, g: 940, fragile: false, upright: false, stack: 6000 },
  { prefix: 'JAR', noun: 'Spiced Honey Preserve Jar', l: 92, w: 92, h: 128, g: 590, fragile: true, upright: true, stack: 0 },
  { prefix: 'TRV', noun: 'Cast Iron Trivet', l: 185, w: 185, h: 28, g: 1120, fragile: false, upright: false, stack: 9000 },
  { prefix: 'WRP', noun: 'Kraft Wrapping Roll', l: 480, w: 68, h: 68, g: 310, fragile: false, upright: false, stack: 900 },
  { prefix: 'APR', noun: 'Canvas Baker Apron', l: 230, w: 175, h: 40, g: 390, fragile: false, upright: false, stack: 2800 },
  { prefix: 'TEA', noun: 'Loose-Leaf Winter Tea Caddy', l: 110, w: 110, h: 145, g: 340, fragile: false, upright: true, stack: 1600 },
];

export async function seed(store: DataStore<Schema>, ctx: SeedContext): Promise<void> {
  const rng = createRng(3022026);
  const nowMs = ctx.now.getTime();
  const cartonRepo = store.repo('Carton');
  const skuRepo = store.repo('Sku');
  const orderRepo = store.repo('PackOrder');
  const lineRepo = store.repo('PackLine');
  const planRepo = store.repo('PackPlan');

  // 1. Seed 12 cartons
  const cartons: Carton[] = [];
  for (const spec of CARTON_CATALOG) {
    cartons.push(await cartonRepo.create(spec));
  }

  // 2. Seed 60 SKUs (8 fragile, 3 unverified)
  const skus: Sku[] = [];
  let fragileBudget = 8;
  for (let i = 0; i < 60; i++) {
    const tpl = SKU_TEMPLATES[i % SKU_TEMPLATES.length];
    const adj = SKU_ADJECTIVES[Math.floor(i / SKU_TEMPLATES.length) % SKU_ADJECTIVES.length];
    const jitterL = Math.round((rng() - 0.5) * 24);
    const jitterW = Math.round((rng() - 0.5) * 18);
    const jitterH = Math.round((rng() - 0.5) * 16);
    const isFragile = tpl.fragile && fragileBudget > 0;
    if (isFragile) fragileBudget--;

    // 3 unverified SKUs (indices 5, 19, 41)
    const verified = i !== 5 && i !== 19 && i !== 41;

    const created = await skuRepo.create({
      sku: `${tpl.prefix}-${String(101 + i)}`,
      name: `${adj} ${tpl.noun}`,
      length: Math.max(60, tpl.l + jitterL),
      width: Math.max(55, tpl.w + jitterW),
      height: Math.max(25, tpl.h + jitterH),
      weightGrams: Math.max(120, Math.round(tpl.g * (0.88 + rng() * 0.24))),
      fragile: isFragile,
      keepUpright: tpl.upright,
      stackLimitGrams: isFragile ? 0 : tpl.stack,
      verified,
      verifiedBy: verified ? 'demo-admin' : null,
    });
    skus.push(created);
  }

  const skuMap = new Map(skus.map((s) => [s.id, s]));
  const verifiedSkus = skus.filter((s) => s.verified);
  const verifiedFragile = verifiedSkus.filter((s) => s.fragile);
  const verifiedSturdy = verifiedSkus.filter((s) => !s.fragile);
  const unverifiedSkus = skus.filter((s) => !s.verified);

  // 3. Seed 40 orders over the last 3 days
  const packers = ['demo-packer-1', 'demo-packer-2', 'demo-admin'];

  for (let i = 0; i < 40; i++) {
    const isPacked = i < 25;
    const hoursAgo = isPacked ? 2 + Math.floor((i / 25) * 68) : Math.floor((i - 25) * 1.4);
    const createdAt = new Date(nowMs - hoursAgo * 3_600_000).toISOString();
    const ref = `ORD-${String(3101 + i)}`;

    const order: PackOrder = await orderRepo.create({
      ref,
      createdAt,
      status: isPacked ? 'packed' : 'open',
      packerSub: isPacked ? packers[i % packers.length] : null,
      packedAt: isPacked ? new Date(nowMs - Math.max(0, hoursAgo - 0.5) * 3_600_000).toISOString() : null,
    });

    const orderLines: PackLine[] = [];
    const addLine = async (sku: Sku, qty: number) => {
      orderLines.push(await lineRepo.create({ packOrderId: order.id, skuId: sku.id, qty }));
    };

    if (i === 25) {
      await addLine(verifiedFragile[0], 1);
      await addLine(verifiedSturdy.find((s) => s.sku.startsWith('KTL')) ?? verifiedSturdy[0], 1);
      await addLine(verifiedSturdy.find((s) => s.sku.startsWith('CND')) ?? verifiedSturdy[1], 1);
      await addLine(verifiedSturdy.find((s) => s.sku.startsWith('TIN')) ?? verifiedSturdy[2], 1);
    } else if (i === 26) {
      await addLine(verifiedFragile[1 % verifiedFragile.length], 2);
      await addLine(verifiedSturdy.find((s) => s.sku.startsWith('KTL')) ?? verifiedSturdy[0], 4);
      await addLine(verifiedSturdy.find((s) => s.sku.startsWith('THR')) ?? verifiedSturdy[3], 5);
    } else if (i === 27) {
      await addLine(unverifiedSkus[0], 1);
      await addLine(verifiedSturdy[4], 1);
    } else if (i === 28) {
      await addLine(unverifiedSkus[1], 1);
      await addLine(verifiedFragile[2 % verifiedFragile.length], 1);
    } else {
      const lineCount = 1 + Math.floor(rng() * 3);
      const picked = new Set<string>();
      for (let l = 0; l < lineCount; l++) {
        const pool = l === 0 && rng() < 0.35 ? verifiedFragile : verifiedSturdy;
        const sku = pool[Math.floor(rng() * pool.length)];
        if (picked.has(sku.id)) continue;
        picked.add(sku.id);
        await addLine(sku, rng() < 0.25 ? 2 : 1);
      }
    }

    if (isPacked) {
      const units = expandUnits(orderLines, skuMap);
      const auto = chooseCarton(units, cartons);
      const isPackerOverride = i >= 20 && i < 25;

      let chosenCand = auto.chosen;
      let source: 'auto' | 'packer' = 'auto';

      if (isPackerOverride && chosenCand) {
        const bigger = auto.candidates.find(
          (c) =>
            c.fits &&
            c.innerVolumeMm3 > chosenCand!.innerVolumeMm3 * 1.35 &&
            c.totalCost > chosenCand!.totalCost + 0.3,
        );
        if (bigger) {
          chosenCand = bigger;
          source = 'packer';
        }
      }

      if (chosenCand && chosenCand.pack) {
        await planRepo.create({
          packOrderId: order.id,
          cartonId: chosenCand.carton.id,
          boxNo: 1,
          placements: serializePlacements(chosenCand.pack.placements),
          voidPct: chosenCand.pack.voidPct,
          actualGrams: chosenCand.actualGrams,
          dimGrams: chosenCand.dimGrams,
          billableGrams: chosenCand.billableGrams,
          source,
          packerSub: order.packerSub ?? 'demo-packer-1',
          createdAt: order.packedAt ?? createdAt,
        });
      }
    }
  }
}
