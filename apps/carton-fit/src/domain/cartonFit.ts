import type { DataStore } from '@x10/shared/data';
import type { Person } from '@x10/shared/identity';

import { PermissionError, RuleError } from './errors';

import type { Carton, PackLine, PackOrder, PackPlan, Schema, Sku } from '../model';
import {
  billableCost,
  chooseCarton,
  computeAirBill,
  computeReorderSuggestions,
  evaluateCarton,
  evaluateWeighIn,
  expandUnits,
  hydratePlacementsFromPlan,
  serializePlacements,
  type AirBillDay,
  type OrderPlanChoice,
  type Placement,
  type ReorderSuggestion,
  type WeighInResult,
} from './packing';

export interface OrderView {
  order: PackOrder;
  lines: PackLine[];
  skus: Sku[];
  plans: PackPlan[];
  unitCount: number;
  fragileCount: number;
  unverifiedSkus: Sku[];
  autoChoice: OrderPlanChoice;
  /** Primary carton shown on the bench (committed plan's carton if packed, else auto chosen or split box 1). */
  activeCarton: Carton | null;
  activePlacements: Placement[];
  activeVoidPct: number;
  activeActualGrams: number;
  activeDimGrams: number;
  activeBillableGrams: number;
  needsSplit: boolean;
  packerOverrodeMoreExpensive: boolean;
  overrideExtraCost: number;
}

export interface CartonFitSnapshot {
  cartons: Carton[];
  skus: Sku[];
  orders: PackOrder[];
  lines: PackLine[];
  plans: PackPlan[];
  people: Person[];
  orderViews: OrderView[];
  reorders: ReorderSuggestion[];
  airBill: {
    days: AirBillDay[];
    totalAirKg: number;
    totalBillableKg: number;
    totalActualKg: number;
    overrideCount: number;
    totalOverrideExtraCost: number;
    overrideOrderIds: Set<string>;
  };
}

export async function loadCartonFitSnapshot(store: DataStore<Schema>, now = new Date()): Promise<CartonFitSnapshot> {
  const [cartons, skus, orders, lines, plans, people] = await Promise.all([
    store.repo('Carton').list(),
    store.repo('Sku').list(),
    store.repo('PackOrder').list(),
    store.repo('PackLine').list(),
    store.repo('PackPlan').list(),
    store.repo('Person').list(),
  ]);

  const cartonMap = new Map(cartons.map((c) => [c.id, c]));
  const skuMap = new Map(skus.map((s) => [s.id, s]));
  const linesByOrder = new Map<string, PackLine[]>();
  for (const line of lines) {
    const arr = linesByOrder.get(line.packOrderId) ?? [];
    arr.push(line);
    linesByOrder.set(line.packOrderId, arr);
  }
  const plansByOrder = new Map<string, PackPlan[]>();
  for (const plan of plans) {
    const arr = plansByOrder.get(plan.packOrderId) ?? [];
    arr.push(plan);
    plansByOrder.set(plan.packOrderId, arr);
  }

  const orderViews: OrderView[] = orders
    .map((order) => {
      const orderLines = linesByOrder.get(order.id) ?? [];
      const orderSkus = orderLines
        .map((l) => skuMap.get(l.skuId))
        .filter((s): s is Sku => Boolean(s));
      const orderPlans = (plansByOrder.get(order.id) ?? []).sort((a, b) => a.boxNo - b.boxNo);
      const units = expandUnits(orderLines, skuMap);
      const autoChoice = chooseCarton(units, cartons);
      const unverifiedSkus = orderSkus.filter((s) => !s.verified);

      let activeCarton: Carton | null = null;
      let activePlacements: Placement[] = [];
      let activeVoidPct = 0;
      let activeActualGrams = 0;
      let activeDimGrams = 0;
      let activeBillableGrams = 0;
      let packerOverrodeMoreExpensive = false;
      let overrideExtraCost = 0;

      if (orderPlans.length > 0) {
        const primary = orderPlans[0];
        activeCarton = cartonMap.get(primary.cartonId) ?? null;
        activePlacements = hydratePlacementsFromPlan(primary, orderLines, skuMap);
        activeVoidPct = primary.voidPct;
        activeActualGrams = orderPlans.reduce((acc, p) => acc + p.actualGrams, 0);
        activeDimGrams = orderPlans.reduce((acc, p) => acc + p.dimGrams, 0);
        activeBillableGrams = orderPlans.reduce((acc, p) => acc + p.billableGrams, 0);

        if (primary.source === 'packer' && activeCarton && autoChoice.chosen) {
          const usedCost = billableCost(activeCarton, primary.billableGrams);
          const diff = Number((usedCost - autoChoice.chosen.totalCost).toFixed(2));
          if (diff > 0.01) {
            packerOverrodeMoreExpensive = true;
            overrideExtraCost = diff;
          }
        }
      } else if (autoChoice.chosen && autoChoice.chosen.pack) {
        activeCarton = autoChoice.chosen.carton;
        activePlacements = autoChoice.chosen.pack.placements;
        activeVoidPct = autoChoice.chosen.pack.voidPct;
        activeActualGrams = autoChoice.chosen.actualGrams;
        activeDimGrams = autoChoice.chosen.dimGrams;
        activeBillableGrams = autoChoice.chosen.billableGrams;
      } else if (autoChoice.split && autoChoice.split.boxes.length > 0) {
        const firstBox = autoChoice.split.boxes[0];
        activeCarton = firstBox.candidate.carton;
        activePlacements = firstBox.candidate.pack?.placements ?? [];
        activeVoidPct = firstBox.candidate.pack?.voidPct ?? 0;
        activeActualGrams = autoChoice.split.totalActualGrams;
        activeDimGrams = autoChoice.split.totalDimGrams;
        activeBillableGrams = autoChoice.split.totalBillableGrams;
      }

      return {
        order,
        lines: orderLines,
        skus: orderSkus,
        plans: orderPlans,
        unitCount: units.length,
        fragileCount: units.filter((u) => u.fragile).length,
        unverifiedSkus,
        autoChoice,
        activeCarton,
        activePlacements,
        activeVoidPct,
        activeActualGrams,
        activeDimGrams,
        activeBillableGrams,
        needsSplit: !autoChoice.chosen && Boolean(autoChoice.split),
        packerOverrodeMoreExpensive,
        overrideExtraCost,
      };
    })
    .sort((a, b) => {
      if (a.order.status !== b.order.status) return a.order.status === 'open' ? -1 : 1;
      return b.order.createdAt.localeCompare(a.order.createdAt);
    });

  const reorders = computeReorderSuggestions(cartons, plans, now);
  const airBill = computeAirBill(plans, cartonMap, linesByOrder, skuMap, cartons);

  return {
    cartons: [...cartons].sort(
      (a, b) => a.innerLength * a.innerWidth * a.innerHeight - b.innerLength * b.innerWidth * b.innerHeight,
    ),
    skus: [...skus].sort((a, b) => a.sku.localeCompare(b.sku)),
    orders,
    lines,
    plans,
    people,
    orderViews,
    reorders,
    airBill,
  };
}

/**
 * Confirm packing an open order with either the automatic choice (single or 2-carton split)
 * or a packer-chosen fitting carton. Decrements carton stock and writes immutable PackPlan row(s).
 */
export async function confirmPackOrder(
  store: DataStore<Schema>,
  actor: Person,
  orderId: string,
  overrideCartonId?: string | null,
): Promise<PackPlan[]> {
  const [order, allLines, allSkus, allCartons] = await Promise.all([
    store.repo('PackOrder').get(orderId),
    store.repo('PackLine').list(),
    store.repo('Sku').list(),
    store.repo('Carton').list(),
  ]);

  if (!order) throw new RuleError('Order not found.');
  if (order.status === 'packed') throw new RuleError('Order is already packed.');
  if (order.packerSub && order.packerSub !== actor.sub && !actor.isAdmin) {
    throw new PermissionError('Another packer has already claimed this order.');
  }

  const lines = allLines.filter((l) => l.packOrderId === orderId);
  const skuMap = new Map(allSkus.map((s) => [s.id, s]));
  const unverified = lines
    .map((l) => skuMap.get(l.skuId))
    .filter((s): s is Sku => s !== undefined && !s.verified);
  if (unverified.length > 0) {
    throw new RuleError(
      `Cannot pack order: unverified SKU dimensions (${unverified.map((s) => s.sku).join(', ')}).`,
    );
  }

  const units = expandUnits(lines, skuMap);
  if (units.length === 0) throw new RuleError('Order has no items to pack.');

  const choice = chooseCarton(units, allCartons);
  const nowIso = new Date().toISOString();
  const createdPlans: PackPlan[] = [];
  const planRepo = store.repo('PackPlan');
  const cartonRepo = store.repo('Carton');

  if (overrideCartonId) {
    const carton = allCartons.find((c) => c.id === overrideCartonId);
    if (!carton) throw new RuleError('Selected carton not found.');
    const evalRes = evaluateCarton(units, carton);
    if (!evalRes.fits || !evalRes.pack) {
      throw new RuleError(`Selected carton ${carton.code} cannot pack this order: ${evalRes.reason ?? 'no fit'}.`);
    }
    const isAutoMatch = choice.chosen?.carton.id === carton.id;
    const plan = await planRepo.create({
      packOrderId: orderId,
      cartonId: carton.id,
      boxNo: 1,
      placements: serializePlacements(evalRes.pack.placements),
      voidPct: evalRes.pack.voidPct,
      actualGrams: evalRes.actualGrams,
      dimGrams: evalRes.dimGrams,
      billableGrams: evalRes.billableGrams,
      source: isAutoMatch ? 'auto' : 'packer',
      packerSub: actor.sub,
      createdAt: nowIso,
    });
    createdPlans.push(plan);
    await cartonRepo.update(carton.id, { stock: Math.max(0, carton.stock - 1) });
  } else if (choice.chosen && choice.chosen.pack) {
    const c = choice.chosen;
    const plan = await planRepo.create({
      packOrderId: orderId,
      cartonId: c.carton.id,
      boxNo: 1,
      placements: serializePlacements(c.pack!.placements),
      voidPct: c.pack!.voidPct,
      actualGrams: c.actualGrams,
      dimGrams: c.dimGrams,
      billableGrams: c.billableGrams,
      source: 'auto',
      packerSub: actor.sub,
      createdAt: nowIso,
    });
    createdPlans.push(plan);
    await cartonRepo.update(c.carton.id, { stock: Math.max(0, c.carton.stock - 1) });
  } else if (choice.split) {
    const stockTrack = new Map(allCartons.map((c) => [c.id, c.stock]));
    for (const box of choice.split.boxes) {
      const cand = box.candidate;
      const plan = await planRepo.create({
        packOrderId: orderId,
        cartonId: cand.carton.id,
        boxNo: box.boxNo,
        placements: serializePlacements(cand.pack?.placements ?? []),
        voidPct: cand.pack?.voidPct ?? 0,
        actualGrams: cand.actualGrams,
        dimGrams: cand.dimGrams,
        billableGrams: cand.billableGrams,
        source: 'auto',
        packerSub: actor.sub,
        createdAt: nowIso,
      });
      createdPlans.push(plan);
      const nextStock = Math.max(0, (stockTrack.get(cand.carton.id) ?? 0) - 1);
      stockTrack.set(cand.carton.id, nextStock);
      await cartonRepo.update(cand.carton.id, { stock: nextStock });
    }
  } else {
    throw new RuleError('No active in-stock carton or two-carton split can pack this order.');
  }

  await store.repo('PackOrder').update(orderId, {
    status: 'packed',
    packerSub: actor.sub,
    packedAt: nowIso,
  });

  return createdPlans;
}

/**
 * Rule 4: Packer weighs a packed order on the bench scale.
 * If the gap exceeds WEIGH_TOLERANCE (5%), all SKUs on the order are flagged verified=false for engineering review.
 */
export async function recordWeighIn(
  store: DataStore<Schema>,
  orderId: string,
  scaleGrams: number,
): Promise<{ result: WeighInResult; flaggedSkus: Sku[] }> {
  if (!Number.isFinite(scaleGrams) || scaleGrams <= 0) {
    throw new RuleError('Scale weight must be greater than 0 g.');
  }
  const [plans, lines, skus] = await Promise.all([
    store.repo('PackPlan').list(),
    store.repo('PackLine').list(),
    store.repo('Sku').list(),
  ]);
  const orderPlans = plans.filter((p) => p.packOrderId === orderId);
  if (orderPlans.length === 0) throw new RuleError('Order has no pack plan to weigh.');

  const computedActualGrams = orderPlans.reduce((acc, p) => acc + p.actualGrams, 0);
  const result = evaluateWeighIn(computedActualGrams, Math.round(scaleGrams));
  const flaggedSkus: Sku[] = [];

  if (result.suspect) {
    const orderSkuIds = new Set(lines.filter((l) => l.packOrderId === orderId).map((l) => l.skuId));
    const skuRepo = store.repo('Sku');
    for (const sku of skus) {
      if (orderSkuIds.has(sku.id)) {
        const updated = await skuRepo.update(sku.id, { verified: false, verifiedBy: null });
        flaggedSkus.push(updated);
      }
    }
  }

  return { result, flaggedSkus };
}

/** Admin (Packaging engineer): verify or correct SKU dimensions and weight. */
export async function verifySkuDimensions(
  store: DataStore<Schema>,
  actor: Person,
  skuId: string,
  patch: Pick<Sku, 'length' | 'width' | 'height' | 'weightGrams' | 'fragile' | 'keepUpright' | 'stackLimitGrams'>,
): Promise<Sku> {
  if (!actor.isAdmin) throw new PermissionError('Only a packaging engineer can verify SKU dimensions.');
  if (patch.length <= 0 || patch.width <= 0 || patch.height <= 0 || patch.weightGrams <= 0) {
    throw new RuleError('Dimensions and weight must be positive integers.');
  }
  return store.repo('Sku').update(skuId, {
    ...patch,
    stackLimitGrams: patch.fragile ? 0 : Math.max(0, patch.stackLimitGrams),
    verified: true,
    verifiedBy: actor.sub,
  });
}

/** Admin (Packaging engineer): create a new carton in the library. */
export async function createCarton(
  store: DataStore<Schema>,
  actor: Person,
  input: Omit<Carton, 'id'>,
): Promise<Carton> {
  if (!actor.isAdmin) throw new PermissionError('Only a packaging engineer can add cartons.');
  if (!input.code.trim() || !input.name.trim()) throw new RuleError('Carton code and name are required.');
  if (input.innerLength <= 0 || input.innerWidth <= 0 || input.innerHeight <= 0) {
    throw new RuleError('Inner dimensions must be positive mm.');
  }
  return store.repo('Carton').create({
    ...input,
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
  });
}

/** Admin (Packaging engineer): restock or update a carton's stock / reorder point / active flag. */
export async function updateCartonStock(
  store: DataStore<Schema>,
  actor: Person,
  cartonId: string,
  patch: Partial<Pick<Carton, 'stock' | 'reorderPoint' | 'active' | 'unitCost'>>,
): Promise<Carton> {
  if (!actor.isAdmin) throw new PermissionError('Only a packaging engineer can update carton stock or rules.');
  if (patch.stock !== undefined && patch.stock < 0) throw new RuleError('Stock cannot be negative.');
  return store.repo('Carton').update(cartonId, patch);
}

/** Create a new open pack order with one or more SKU lines (used by smoke tests and bench intake). */
export async function createPackOrder(
  store: DataStore<Schema>,
  ref: string,
  items: Array<{ skuId: string; qty: number }>,
): Promise<PackOrder> {
  const trimmed = ref.trim();
  if (!trimmed) throw new RuleError('Order reference is required.');
  if (items.length === 0 || items.every((i) => i.qty <= 0)) {
    throw new RuleError('Add at least one SKU line to the order.');
  }
  const order = await store.repo('PackOrder').create({
    ref: trimmed,
    createdAt: new Date().toISOString(),
    status: 'open',
    packerSub: null,
    packedAt: null,
  });
  const lineRepo = store.repo('PackLine');
  for (const item of items) {
    if (item.qty > 0) {
      await lineRepo.create({
        packOrderId: order.id,
        skuId: item.skuId,
        qty: Math.floor(item.qty),
      });
    }
  }
  return order;
}
