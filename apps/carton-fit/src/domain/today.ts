import type { TodayItem } from '@x10/shared/ui';

import type { CartonFitSnapshot } from './cartonFit';

export type BenchLens = 'void' | 'billable' | 'fragile' | 'stack' | 'stock';
export type BenchRole = 'packer' | 'engineer';

export interface BenchTodayItem extends TodayItem {
  targetLens: BenchLens;
  orderId?: string;
  cartonId?: string;
  route?: string;
}

export function buildTodayItems(snapshot: CartonFitSnapshot, role: BenchRole): BenchTodayItem[] {
  const items: BenchTodayItem[] = [];

  // 1. Cartons at or below reorder
  if (snapshot.reorders.length > 0) {
    const worst = snapshot.reorders[0];
    items.push({
      id: 'reorder-low',
      title: `${snapshot.reorders.length} carton${snapshot.reorders.length === 1 ? '' : 's'} below reorder`,
      meta: `${worst.carton.code} has ${worst.carton.stock} left (reorder ${worst.carton.reorderPoint})`,
      severity: 'bad',
      value: String(worst.carton.stock),
      unit: 'left',
      lens: 'Carton stock',
      targetLens: 'stock',
      cartonId: worst.carton.id,
      route: '/reorder',
    });
  }

  // 2. Unverified SKUs blocking open orders
  const blockedOrder = snapshot.orderViews.find((ov) => ov.order.status === 'open' && ov.unverifiedSkus.length > 0);
  if (blockedOrder) {
    items.push({
      id: `unverified-${blockedOrder.order.id}`,
      title: `${blockedOrder.order.ref} blocked by unverified SKU`,
      meta: `${blockedOrder.unverifiedSkus[0].sku} awaits engineer dimension check`,
      severity: 'warn',
      value: String(blockedOrder.unverifiedSkus.length),
      unit: 'unverified',
      lens: 'Fragile',
      targetLens: 'fragile',
      orderId: blockedOrder.order.id,
      route: role === 'engineer' ? '/weigh-in' : undefined,
    });
  }

  // 3. Split-carton order
  const splitOrder = snapshot.orderViews.find((ov) => ov.needsSplit);
  if (splitOrder) {
    items.push({
      id: `split-${splitOrder.order.id}`,
      title: `${splitOrder.order.ref} needs a 2-carton split`,
      meta: `${splitOrder.unitCount} units · ${(splitOrder.activeBillableGrams / 1000).toFixed(2)} kg combined billable`,
      severity: 'info',
      value: '2',
      unit: 'boxes',
      lens: 'Billable wt',
      targetLens: 'billable',
      orderId: splitOrder.order.id,
    });
  }

  // 4. Packer chose a bigger/more expensive carton than auto
  const worstOverride = [...snapshot.orderViews]
    .filter((ov) => ov.packerOverrodeMoreExpensive)
    .sort((a, b) => b.overrideExtraCost - a.overrideExtraCost)[0];
  if (worstOverride) {
    items.push({
      id: `override-${worstOverride.order.id}`,
      title: `${snapshot.airBill.overrideCount} overrides cost +$${snapshot.airBill.totalOverrideExtraCost.toFixed(2)}`,
      meta: `${worstOverride.order.ref} used ${worstOverride.activeCarton?.code ?? 'larger box'} (+$${worstOverride.overrideExtraCost.toFixed(2)})`,
      severity: 'warn',
      value: `+$${worstOverride.overrideExtraCost.toFixed(2)}`,
      unit: 'extra',
      lens: 'Billable wt',
      targetLens: 'billable',
      orderId: worstOverride.order.id,
    });
  }

  // 5. Most air shipped today
  const mostAir = [...snapshot.orderViews]
    .filter((ov) => ov.order.status === 'packed')
    .sort((a, b) => (b.activeBillableGrams - b.activeActualGrams) - (a.activeBillableGrams - a.activeActualGrams))[0];
  if (mostAir) {
    const airKg = Math.max(0, (mostAir.activeBillableGrams - mostAir.activeActualGrams) / 1000);
    items.push({
      id: `air-${mostAir.order.id}`,
      title: `Most air shipped: ${mostAir.order.ref}`,
      meta: `${mostAir.activeVoidPct.toFixed(0)}% void · ${airKg.toFixed(2)} kg billed air`,
      severity: mostAir.activeVoidPct > 40 ? 'warn' : 'ok',
      value: `${mostAir.activeVoidPct.toFixed(0)}%`,
      unit: 'void',
      lens: 'Void %',
      targetLens: 'void',
      orderId: mostAir.order.id,
    });
  }

  return items.slice(0, 5);
}
