import { useCallback, useMemo, useState } from 'react';
import { Check, Scale } from 'lucide-react';
import { AdminOnly, useApp } from '@x10/shared/runtime';
import { useAsync } from '@x10/shared/lib';
import {
  Badge,
  Button,
  Callout,
  Card,
  DataState,
  Field,
  InlineError,
  Input,
  PageHeader,
  Section,
  Select,
  Stat,
  StatStrip,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@x10/shared/ui';

import { loadCartonFitSnapshot, recordWeighIn, verifySkuDimensions } from '../domain/cartonFit';
import { WEIGH_TOLERANCE } from '../domain/config';
import type { WeighInResult } from '../domain/packing';
import type { Schema, Sku } from '../model';

export function WeighInPage() {
  const { store, me } = useApp<Schema>();
  const loader = useCallback(() => loadCartonFitSnapshot(store), [store]);
  const state = useAsync(loader, [loader]);

  const packedOrders = useMemo(
    () => (state.data?.orderViews ?? []).filter((ov) => ov.order.status === 'packed'),
    [state.data],
  );
  const unverifiedSkus = useMemo(() => (state.data?.skus ?? []).filter((s) => !s.verified), [state.data]);

  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [scaleGrams, setScaleGrams] = useState('');
  const [lastResult, setLastResult] = useState<{ result: WeighInResult; flagged: Sku[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveOrderId = selectedOrderId || packedOrders[0]?.order.id || '';
  const selectedOrder = packedOrders.find((ov) => ov.order.id === effectiveOrderId);

  const handleWeighIn = async () => {
    if (!effectiveOrderId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await recordWeighIn(store, effectiveOrderId, Number(scaleGrams));
      setLastResult({ result: res.result, flagged: res.flaggedSkus });
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to record weigh-in.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifySku = async (sku: Sku) => {
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      await verifySkuDimensions(store, me, sku.id, {
        length: sku.length,
        width: sku.width,
        height: sku.height,
        weightGrams: sku.weightGrams,
        fragile: sku.fragile,
        keepUpright: sku.keepUpright,
        stackLimitGrams: sku.stackLimitGrams,
      });
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify SKU.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Weigh-in" />

      {error && <InlineError error={error} />}

      <DataState state={state}>
        {() => (
          <div className="space-y-6">
            <StatStrip>
              <Stat label="Packed orders ready" value={String(packedOrders.length)} />
              <Stat label="Tolerance threshold" value={`±${Math.round(WEIGH_TOLERANCE * 100)}%`} />
              <Stat
                label="Unverified / suspect SKUs"
                value={String(unverifiedSkus.length)}
                tone={unverifiedSkus.length > 0 ? 'warn' : 'ok'}
              />
            </StatStrip>

            <Section title="Bench scale check">
              <Card className="grid grid-cols-1 gap-4 p-4 md:grid-cols-[1fr_200px_auto] md:items-end">
                <Field label="Packed order" htmlFor="weigh-order">
                  <Select
                    id="weigh-order"
                    value={effectiveOrderId}
                    onChange={(e) => {
                      setSelectedOrderId(e.target.value);
                      setLastResult(null);
                    }}
                  >
                    {packedOrders.map((ov) => (
                      <option key={ov.order.id} value={ov.order.id}>
                        {ov.order.ref} — expected {ov.activeActualGrams} g ({ov.activeCarton?.code ?? 'plan'})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Scale reading (g)" htmlFor="scale-grams">
                  <Input
                    id="scale-grams"
                    type="number"
                    placeholder={selectedOrder ? String(selectedOrder.activeActualGrams) : '1800'}
                    value={scaleGrams}
                    onChange={(e) => setScaleGrams(e.target.value)}
                  />
                </Field>
                <Button
                  icon={<Scale className="h-4 w-4" />}
                  disabled={busy || !effectiveOrderId || !scaleGrams}
                  onClick={handleWeighIn}
                >
                  Check scale
                </Button>
              </Card>

              {lastResult && (
                <div className="mt-3">
                  <Callout
                    tone={lastResult.result.suspect ? 'warn' : 'ok'}
                    title={
                      lastResult.result.suspect
                        ? `Discrepancy ${(lastResult.result.gapPct * 100).toFixed(1)}% — flagged ${lastResult.flagged.length} SKU(s) for verification`
                        : `Scale matches within ${(lastResult.result.gapPct * 100).toFixed(1)}%`
                    }
                  >
                    Expected {lastResult.result.computedActualGrams} g, measured {lastResult.result.scaleGrams} g (delta{' '}
                    {lastResult.result.deltaGrams >= 0 ? '+' : ''}
                    {lastResult.result.deltaGrams} g).
                  </Callout>
                </div>
              )}
            </Section>

            <Section title="Unverified & suspect SKUs">
              <TableWrap>
                <Table>
                  <thead>
                    <Tr>
                      <Th>SKU</Th>
                      <Th>Name</Th>
                      <Th numeric>Dimensions (mm)</Th>
                      <Th numeric>Weight (g)</Th>
                      <Th>Handling</Th>
                      <Th />
                    </Tr>
                  </thead>
                  <tbody>
                    {unverifiedSkus.map((s) => (
                      <Tr key={s.id}>
                        <Td className="font-mono font-medium">{s.sku}</Td>
                        <Td>{s.name}</Td>
                        <Td numeric>
                          {s.length}×{s.width}×{s.height}
                        </Td>
                        <Td numeric>{s.weightGrams}</Td>
                        <Td>
                          {s.fragile ? <Badge tone="warn">Fragile</Badge> : <Badge tone="neutral">Standard</Badge>}
                        </Td>
                        <Td>
                          <AdminOnly>
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<Check className="h-3.5 w-3.5" />}
                              disabled={busy}
                              onClick={() => handleVerifySku(s)}
                            >
                              Verify dims
                            </Button>
                          </AdminOnly>
                        </Td>
                      </Tr>
                    ))}
                    {unverifiedSkus.length === 0 && (
                      <Tr>
                        <Td colSpan={6} className="text-center text-muted">
                          All SKUs have verified dimensions.
                        </Td>
                      </Tr>
                    )}
                  </tbody>
                </Table>
              </TableWrap>
            </Section>
          </div>
        )}
      </DataState>
    </div>
  );
}
