import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, HelpCircle, Minus, Plus, RotateCcw } from 'lucide-react';
import { useApp } from '@x10/shared/runtime';
import { useAsync, usePolling } from '@x10/shared/lib';
import {
  Badge,
  Button,
  Dialog,
  Field,
  IconButton,
  InlineError,
  Input,
  Kbd,
  Legend,
  LensBar,
  Select,
  StageMessage,
  StagePage,
  TodayPanel,
  useHotkeys,
  useIsDesktop,
  useReducedMotion,
  useThemeColors,
  ViewAsSwitch,
  ViewToggle,
  supportsWebGL,
  type LegendItem,
  type LensOption,
} from '@x10/shared/ui';

import { BenchInspector } from '../bench/BenchInspector';
import { BenchList } from '../bench/BenchList';
import type { PackingTableApi } from '../bench/PackingTableCanvas';
import { PackingTableSvg } from '../bench/PackingTableSvg';
import { buildBenchPalette } from '../bench/theme';
import { confirmPackOrder, createPackOrder, loadCartonFitSnapshot } from '../domain/cartonFit';
import { evaluateCarton, expandUnits } from '../domain/packing';
import { buildTodayItems, type BenchLens, type BenchRole, type BenchTodayItem } from '../domain/today';
import type { Schema } from '../model';

const PackingTableCanvas = lazy(() => import('../bench/PackingTableCanvas'));

const LENSES: LensOption<BenchLens>[] = [
  { value: 'void', label: 'Void %', description: 'Frosted air volume and kraft paper fill inside the carton' },
  { value: 'billable', label: 'Billable wt', description: 'Dimensional vs actual weight across candidate cartons' },
  { value: 'fragile', label: 'Fragile', description: '20 mm amber cushion clearance and zero-load tops' },
  { value: 'stack', label: 'Stack load', description: 'Vertical load above each unit as a share of its limit' },
  { value: 'stock', label: 'Carton stock', description: 'Candidate rack highlighted by reorder health' },
];

const ROLES: { value: BenchRole; label: string }[] = [
  { value: 'packer', label: 'Packer' },
  { value: 'engineer', label: 'Engineer' },
];

export function HomePage() {
  const { store, me } = useApp<Schema>();
  const navigate = useNavigate();
  const colors = useThemeColors();
  const palette = useMemo(() => buildBenchPalette(colors), [colors]);
  const reduced = useReducedMotion();
  const isDesktop = useIsDesktop();

  const [view, setView] = useState<'stage' | 'list'>('stage');
  const [lens, setLens] = useState<BenchLens>('void');
  const [role, setRole] = useState<BenchRole>('packer');
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [overrideCartonId, setOverrideCartonId] = useState<string | null>(null);
  const [splitBoxIndex, setSplitBoxIndex] = useState<0 | 1>(0);
  const [focusUnitIndex, setFocusUnitIndex] = useState<number | null>(null);
  const [visibleCount, setVisibleCount] = useState<number>(99);
  const [sideOpen, setSideOpen] = useState(true);
  const [webglFailed, setWebglFailed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [newOrderRef, setNewOrderRef] = useState('ORD-3201');
  const [newOrderSkuId, setNewOrderSkuId] = useState('');
  const [newOrderQty, setNewOrderQty] = useState('2');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmNote, setConfirmNote] = useState<string | null>(null);

  const apiRef = useRef<PackingTableApi | null>(null);

  const loader = useCallback(() => loadCartonFitSnapshot(store), [store]);
  const state = useAsync(loader, [loader]);
  usePolling(state.reload, 5000);

  const snapshot = state.data ?? null;

  // Pick initial hero order (first open order with verified SKUs and a single carton fit)
  const activeOrder = useMemo(() => {
    if (!snapshot || snapshot.orderViews.length === 0) return null;
    if (selectedOrderId) {
      const found = snapshot.orderViews.find((ov) => ov.order.id === selectedOrderId);
      if (found) return found;
    }
    return (
      snapshot.orderViews.find((ov) => ov.order.status === 'open' && ov.unverifiedSkus.length === 0 && !ov.needsSplit) ??
      snapshot.orderViews[0]
    );
  }, [snapshot, selectedOrderId]);

  // Compute displayed carton + placements (supports packer override preview and split box toggle)
  const benchState = useMemo(() => {
    if (!activeOrder || !snapshot) {
      return {
        carton: null,
        placements: [],
        voidPct: 0,
        voidFillLitres: 0,
        voidWarning: false,
        actualGrams: 0,
        dimGrams: 0,
        billableGrams: 0,
        totalCost: 0,
      };
    }

    if (overrideCartonId && activeOrder.order.status === 'open') {
      const ovCarton = snapshot.cartons.find((c) => c.id === overrideCartonId);
      if (ovCarton) {
        const skuMap = new Map(snapshot.skus.map((s) => [s.id, s]));
        const units = expandUnits(activeOrder.lines, skuMap);
        const evaluated = evaluateCarton(units, ovCarton);
        if (evaluated.fits && evaluated.pack) {
          return {
            carton: ovCarton,
            placements: evaluated.pack.placements,
            voidPct: evaluated.pack.voidPct,
            voidFillLitres: evaluated.pack.voidFillLitres,
            voidWarning: evaluated.pack.voidWarning,
            actualGrams: evaluated.actualGrams,
            dimGrams: evaluated.dimGrams,
            billableGrams: evaluated.billableGrams,
            totalCost: evaluated.totalCost,
          };
        }
      }
    }

    if (activeOrder.needsSplit && activeOrder.autoChoice.split) {
      const box = activeOrder.autoChoice.split.boxes[splitBoxIndex] ?? activeOrder.autoChoice.split.boxes[0];
      return {
        carton: box.candidate.carton,
        placements: box.candidate.pack?.placements ?? [],
        voidPct: box.candidate.pack?.voidPct ?? 0,
        voidFillLitres: box.candidate.pack?.voidFillLitres ?? 0,
        voidWarning: box.candidate.pack?.voidWarning ?? false,
        actualGrams: box.candidate.actualGrams,
        dimGrams: box.candidate.dimGrams,
        billableGrams: box.candidate.billableGrams,
        totalCost: box.candidate.totalCost,
      };
    }

    const chosenPack = activeOrder.autoChoice.chosen?.pack;
    return {
      carton: activeOrder.activeCarton,
      placements: activeOrder.activePlacements,
      voidPct: activeOrder.activeVoidPct,
      voidFillLitres: chosenPack?.voidFillLitres ?? Number(((activeOrder.activeVoidPct / 100) * 8 * 0.5).toFixed(2)),
      voidWarning: activeOrder.activeVoidPct > 40,
      actualGrams: activeOrder.activeActualGrams,
      dimGrams: activeOrder.activeDimGrams,
      billableGrams: activeOrder.activeBillableGrams,
      totalCost: activeOrder.autoChoice.chosen?.totalCost ?? 0,
    };
  }, [activeOrder, snapshot, overrideCartonId, splitBoxIndex]);

  useEffect(() => {
    setVisibleCount(benchState.placements.length);
    setFocusUnitIndex(null);
  }, [activeOrder?.order.id, overrideCartonId, splitBoxIndex, benchState.placements.length]);

  useEffect(() => {
    if (snapshot && !newOrderSkuId) {
      const verified = snapshot.skus.find((s) => s.verified);
      if (verified) setNewOrderSkuId(verified.id);
    }
  }, [snapshot, newOrderSkuId]);

  const today = useMemo(() => (snapshot ? buildTodayItems(snapshot, role) : []), [snapshot, role]);

  const focusedPlacement = useMemo(
    () => (focusUnitIndex !== null ? benchState.placements.find((p) => p.unitIndex === focusUnitIndex) ?? null : null),
    [benchState.placements, focusUnitIndex],
  );

  const use3D = supportsWebGL() && !webglFailed && !reduced;

  const clearFocus = useCallback(() => {
    setFocusUnitIndex(null);
    setOverrideCartonId(null);
    apiRef.current?.reset();
  }, []);

  useHotkeys({
    escape: () => {
      if (shortcutsOpen) setShortcutsOpen(false);
      else if (newOrderOpen) setNewOrderOpen(false);
      else clearFocus();
    },
    'shift+?': () => setShortcutsOpen((o) => !o),
  });

  const legendItems = useMemo<LegendItem[]>(() => {
    switch (lens) {
      case 'void':
        return [
          { label: 'Frosted air + paper', color: palette.frostAir, shape: 'square' },
          { label: 'Fragile (+20 mm)', color: palette.fragileAmber, shape: 'ring' },
          { label: 'Chosen carton', color: palette.rackChosen, shape: 'dot' },
        ];
      case 'billable':
        return [
          { label: 'Dim-weight billed', color: palette.warn, shape: 'dot' },
          { label: 'Actual billed', color: palette.ok, shape: 'dot' },
          { label: 'Heavy (>1 kg)', color: palette.accent, shape: 'square' },
        ];
      case 'fragile':
        return [
          { label: 'Fragile (0 top load)', color: palette.fragileAmber, shape: 'dot' },
          { label: 'Standard unit', color: palette.itemBox, shape: 'square' },
        ];
      case 'stack':
        return [
          { label: 'Safe (<35% limit)', color: palette.ok, shape: 'dot' },
          { label: 'Moderate (35–75%)', color: palette.warn, shape: 'dot' },
          { label: 'Near limit (>75%)', color: palette.bad, shape: 'dot' },
        ];
      case 'stock':
        return [
          { label: 'Healthy carton stock', color: palette.rackChosen, shape: 'dot' },
          { label: 'At/below reorder', color: palette.bad, shape: 'dot' },
        ];
    }
  }, [lens, palette]);

  const handleTodaySelect = (item: BenchTodayItem) => {
    setLens(item.targetLens);
    setOverrideCartonId(null);
    if (item.orderId) {
      setSelectedOrderId(item.orderId);
      setSplitBoxIndex(0);
      if (view === 'list') setView('stage');
    } else if (item.route) {
      navigate(item.route);
    }
  };

  const handleConfirmPack = async () => {
    if (!activeOrder || !me) return;
    setBusy(true);
    setActionError(null);
    setConfirmNote(null);
    try {
      const plans = await confirmPackOrder(store, me, activeOrder.order.id, overrideCartonId);
      setOverrideCartonId(null);
      setConfirmNote(
        `Packed ${activeOrder.order.ref} in ${plans.length > 1 ? `${plans.length} split cartons` : benchState.carton?.code ?? 'carton'}.`,
      );
      await state.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to confirm pack plan.');
    } finally {
      setBusy(false);
    }
  };

  const handleCreateOrder = async () => {
    if (!newOrderSkuId) return;
    setBusy(true);
    setActionError(null);
    try {
      const created = await createPackOrder(store, newOrderRef, [{ skuId: newOrderSkuId, qty: Number(newOrderQty) || 1 }]);
      setNewOrderOpen(false);
      setNewOrderRef(`ORD-${3202 + Math.floor((snapshot?.orders.length ?? 0))}`);
      setSelectedOrderId(created.id);
      setOverrideCartonId(null);
      await state.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Unable to create order.');
    } finally {
      setBusy(false);
    }
  };

  const stageBg = `radial-gradient(ellipse at 42% 24%, ${palette.bgTop} 0%, ${palette.bgBottom} 100%)`;

  const openOrders = useMemo(
    () => (snapshot ? snapshot.orderViews.filter((ov) => ov.order.status === 'open').slice(0, 6) : []),
    [snapshot],
  );

  const stageNode =
    state.loading && !snapshot ? (
      <StageMessage title="Warming the packing lamp…">Measuring SKUs and fitting candidate cartons.</StageMessage>
    ) : state.error ? (
      <StageMessage title="Unable to open the Packing Table">{state.error.message}</StageMessage>
    ) : snapshot && activeOrder ? (
      <div className="relative h-full w-full">
        {use3D ? (
          <Suspense
            fallback={
              <PackingTableSvg
                carton={benchState.carton}
                placements={benchState.placements}
                candidates={activeOrder.autoChoice.candidates}
                chosenCartonId={benchState.carton?.id ?? null}
                lens={lens}
                visibleCount={visibleCount}
                focusUnitIndex={focusUnitIndex}
                label="Packing table — three orthographic carton slices"
                onPickUnit={setFocusUnitIndex}
                onPickCarton={(id) => {
                  if (activeOrder.order.status === 'open') setOverrideCartonId(id);
                }}
              />
            }
          >
            <PackingTableCanvas
              carton={benchState.carton}
              placements={benchState.placements}
              candidates={activeOrder.autoChoice.candidates}
              chosenCartonId={benchState.carton?.id ?? null}
              lens={lens}
              visibleCount={visibleCount}
              focusUnitIndex={focusUnitIndex}
              shiftPx={isDesktop && sideOpen ? 320 : 0}
              reduced={reduced}
              label="Packing table — 3D carton fit and candidate rack under warm bench light"
              onPickUnit={setFocusUnitIndex}
              onPickCarton={(id) => {
                if (activeOrder.order.status === 'open') setOverrideCartonId(id);
              }}
              onError={() => setWebglFailed(true)}
              apiRef={apiRef}
            />
          </Suspense>
        ) : (
          <PackingTableSvg
            carton={benchState.carton}
            placements={benchState.placements}
            candidates={activeOrder.autoChoice.candidates}
            chosenCartonId={benchState.carton?.id ?? null}
            lens={lens}
            visibleCount={visibleCount}
            focusUnitIndex={focusUnitIndex}
            label="Packing table — three orthographic carton slices"
            onPickUnit={setFocusUnitIndex}
            onPickCarton={(id) => {
              if (activeOrder.order.status === 'open') setOverrideCartonId(id);
            }}
          />
        )}

        {/* Order ribbon + Placement scrubber + Packer confirm HUD */}
        <div
          className="pointer-events-auto absolute left-3 right-3 top-14 z-10 flex flex-col gap-1.5 md:bottom-[62px] md:left-[220px] md:right-[calc(var(--side-w,0px)+16px)] md:top-auto md:gap-2"
          aria-label="Packing bench controls"
        >
          {actionError && <InlineError error={actionError} />}

          {/* Compact order strip & split toggle */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-[var(--glass)] px-2.5 py-1.5 backdrop-blur-md md:px-3 md:py-2">
            <div className="flex max-w-full items-center gap-1.5 overflow-x-auto">
              {(isDesktop ? openOrders : openOrders.slice(0, 3)).map((ov) => {
                const active = ov.order.id === activeOrder.order.id;
                return (
                  <button
                    key={ov.order.id}
                    type="button"
                    onClick={() => {
                      setSelectedOrderId(ov.order.id);
                      setOverrideCartonId(null);
                      setSplitBoxIndex(0);
                      setActionError(null);
                      setConfirmNote(null);
                    }}
                    className={`min-h-8 rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition ${
                      active
                        ? 'border-accent-9 bg-accent-9 text-white'
                        : 'border-line bg-surface/75 text-fg hover:border-accent-8'
                    }`}
                  >
                    {ov.order.ref}
                    {ov.needsSplit ? ' · split' : ''}
                  </button>
                );
              })}

              {activeOrder.needsSplit && activeOrder.autoChoice.split && (
                <div className="ml-1 flex items-center gap-1 border-l border-line pl-2">
                  {activeOrder.autoChoice.split.boxes.map((b, idx) => (
                    <button
                      key={b.boxNo}
                      type="button"
                      onClick={() => setSplitBoxIndex(idx as 0 | 1)}
                      className={`min-h-7 rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                        splitBoxIndex === idx
                          ? 'border-accent-9 bg-accent-3 text-accent-11'
                          : 'border-line bg-surface/70 text-muted'
                      }`}
                    >
                      Box {b.boxNo}: {b.candidate.carton.code}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Placement scrubber */}
              {benchState.placements.length > 1 && (
                <label className="flex items-center gap-2 text-xs text-muted">
                  <span>Step</span>
                  <input
                    type="range"
                    min={1}
                    max={benchState.placements.length}
                    value={Math.min(visibleCount, benchState.placements.length)}
                    onChange={(e) => setVisibleCount(Number(e.target.value))}
                    aria-label="Replay packing step"
                    data-testid="placement-slider"
                    className="h-1.5 w-24 accent-[var(--accent-9)]"
                  />
                  <span className="font-mono text-fg">
                    {Math.min(visibleCount, benchState.placements.length)}/{benchState.placements.length}
                  </span>
                </label>
              )}

              {/* Metrics readout */}
              <div className="hidden items-center gap-2 font-mono text-xs sm:flex">
                <Badge tone={benchState.voidWarning ? 'warn' : 'ok'}>
                  {benchState.voidPct.toFixed(0)}% void · {benchState.voidFillLitres} L paper
                </Badge>
                <span className="text-muted">
                  Act {(benchState.actualGrams / 1000).toFixed(2)} · Dim {(benchState.dimGrams / 1000).toFixed(2)} ·{' '}
                  <strong className="text-fg">Bill {(benchState.billableGrams / 1000).toFixed(2)} kg</strong>
                </span>
              </div>

              {role === 'packer' && activeOrder.order.status === 'open' && (
                <Button
                  size="sm"
                  disabled={busy || activeOrder.unverifiedSkus.length > 0}
                  onClick={handleConfirmPack}
                  icon={<Check className="h-3.5 w-3.5" />}
                >
                  {activeOrder.needsSplit
                    ? 'Confirm 2-box split'
                    : `Confirm ${benchState.carton?.code ?? 'carton'}`}
                </Button>
              )}
              {role === 'engineer' && (
                <Button size="sm" variant="secondary" onClick={() => setNewOrderOpen(true)}>
                  New order
                </Button>
              )}
            </div>
          </div>

          {/* Void warning or confirmation strip */}
          {(benchState.voidWarning && activeOrder.autoChoice.nextSmallerFailure) || confirmNote ? (
            <div className="flex items-center justify-between rounded-lg border border-line bg-[var(--glass)] px-3 py-1 text-xs backdrop-blur-md">
              {confirmNote ? (
                <span className="font-medium text-fg">{confirmNote}</span>
              ) : (
                <span className="text-muted">
                  High void ({benchState.voidPct.toFixed(0)}%): next smaller carton{' '}
                  <strong className="font-mono text-fg">{activeOrder.autoChoice.nextSmallerFailure?.carton.code}</strong>{' '}
                  failed — {activeOrder.autoChoice.nextSmallerFailure?.reason}.
                </span>
              )}
            </div>
          ) : null}
        </div>

        {focusedPlacement && (
          <div className="pointer-events-none absolute left-4 top-28 z-20 md:left-6">
            <BenchInspector placement={focusedPlacement} onClose={() => setFocusUnitIndex(null)} />
          </div>
        )}
      </div>
    ) : null;

  return (
    <>
      <StagePage
        label="The Packing Table"
        view={view}
        title="The Packing Table"
        meta={
          snapshot && activeOrder
            ? `${activeOrder.order.ref} · ${benchState.carton?.code ?? 'No fit'} · ${benchState.placements.length} units · ${(benchState.billableGrams / 1000).toFixed(2)} kg billable`
            : 'Loading bench…'
        }
        background={stageBg}
        breadcrumb={[
          { label: 'Packing table', onClick: clearFocus },
          { label: activeOrder ? `${activeOrder.order.ref} (${activeOrder.order.status})` : 'Bench' },
        ]}
        topRight={
          <div className="flex items-center gap-1.5">
            {view === 'stage' && use3D && (
              <div className="hidden items-center gap-1 rounded-lg border border-line bg-[var(--glass)] p-0.5 backdrop-blur-md md:flex">
                <IconButton label="Zoom in" icon={<Plus className="h-3.5 w-3.5" />} size="sm" onClick={() => apiRef.current?.zoom(0.86)} />
                <IconButton label="Zoom out" icon={<Minus className="h-3.5 w-3.5" />} size="sm" onClick={() => apiRef.current?.zoom(1.16)} />
                <IconButton label="Reset view" icon={<RotateCcw className="h-3.5 w-3.5" />} size="sm" onClick={clearFocus} />
              </div>
            )}
            <IconButton label="Keyboard shortcuts" icon={<HelpCircle className="h-4 w-4" />} size="sm" onClick={() => setShortcutsOpen(true)} />
            <ViewToggle value={view} onChange={setView} stageLabel="Bench" listLabel="List" glass={view === 'stage'} />
          </div>
        }
        lenses={<LensBar lenses={LENSES} value={lens} onChange={setLens} glass />}
        legend={<Legend title={LENSES.find((l) => l.value === lens)?.label ?? 'Key'} items={legendItems} collapsible />}
        bottomRight={<ViewAsSwitch options={ROLES} value={role} onChange={setRole} glass />}
        sideOpen={sideOpen}
        onSideOpenChange={setSideOpen}
        sideCount={today.length}
        side={
          <TodayPanel
            bare
            title="Today"
            items={today}
            activeId={today.find((t) => t.orderId && t.orderId === activeOrder?.order.id)?.id ?? null}
            onSelect={(item) => handleTodaySelect(item as BenchTodayItem)}
          />
        }
        stage={stageNode}
        list={
          snapshot ? (
            <BenchList
              orderViews={snapshot.orderViews}
              onSelectOrder={(id) => {
                setSelectedOrderId(id);
                setOverrideCartonId(null);
                setSplitBoxIndex(0);
                setView('stage');
              }}
            />
          ) : null
        }
      />

      <Dialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} title="Keyboard shortcuts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt>
            <Kbd>1</Kbd>–<Kbd>5</Kbd>
          </dt>
          <dd className="text-muted">Switch lens</dd>
          <dt>
            <Kbd>V</Kbd>
          </dt>
          <dd className="text-muted">Switch View as (Packer / Engineer)</dd>
          <dt>
            <Kbd>L</Kbd>
          </dt>
          <dd className="text-muted">Toggle Bench / List view</dd>
          <dt>
            <Kbd>Esc</Kbd>
          </dt>
          <dd className="text-muted">Clear selection or close dialog</dd>
          <dt>
            <Kbd>?</Kbd>
          </dt>
          <dd className="text-muted">Show or hide this sheet</dd>
        </dl>
      </Dialog>

      <Dialog open={newOrderOpen} onClose={() => setNewOrderOpen(false)} title="Queue new pack order">
        <div className="space-y-3">
          <Field label="Order reference" htmlFor="new-order-ref">
            <Input id="new-order-ref" value={newOrderRef} onChange={(e) => setNewOrderRef(e.target.value)} />
          </Field>
          <Field label="SKU" htmlFor="new-order-sku">
            <Select id="new-order-sku" value={newOrderSkuId} onChange={(e) => setNewOrderSkuId(e.target.value)}>
              {(snapshot?.skus ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.sku} — {s.name} ({s.length}×{s.width}×{s.height} mm)
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Quantity" htmlFor="new-order-qty">
            <Input
              id="new-order-qty"
              type="number"
              min={1}
              max={12}
              value={newOrderQty}
              onChange={(e) => setNewOrderQty(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setNewOrderOpen(false)}>
              Cancel
            </Button>
            <Button disabled={busy} onClick={handleCreateOrder}>
              Create order
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
