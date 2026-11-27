import { useCallback, useState } from 'react';
import { PackagePlus } from 'lucide-react';
import { AdminOnly, useApp } from '@x10/shared/runtime';
import { useAsync } from '@x10/shared/lib';
import {
  Badge,
  Button,
  DataState,
  InlineError,
  PageHeader,
  Stat,
  StatStrip,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@x10/shared/ui';

import { loadCartonFitSnapshot, updateCartonStock } from '../domain/cartonFit';
import { CARTON_LEAD_DAYS } from '../domain/config';
import type { Schema } from '../model';

export function ReorderSlipPage() {
  const { store, me } = useApp<Schema>();
  const loader = useCallback(() => loadCartonFitSnapshot(store), [store]);
  const state = useAsync(loader, [loader]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reorders = state.data?.reorders ?? [];
  const totalQty = reorders.reduce((acc, r) => acc + r.suggestedQty, 0);
  const totalCost = reorders.reduce((acc, r) => acc + r.estimatedOrderCost, 0);

  const handleReceive = async (cartonId: string, currentStock: number, addQty: number) => {
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      await updateCartonStock(store, me, cartonId, { stock: currentStock + addQty });
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to receive carton stock.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Reorder slip" />

      {error && <InlineError error={error} />}

      <DataState state={state}>
        {() => (
          <div className="space-y-6">
            <StatStrip>
              <Stat label="Cartons to reorder" value={String(reorders.length)} tone={reorders.length > 0 ? 'bad' : 'ok'} />
              <Stat label="Lead time horizon" value={`${CARTON_LEAD_DAYS} days`} />
              <Stat label="Suggested order qty" value={totalQty.toLocaleString()} />
              <Stat label="Estimated PO cost" value={`$${totalCost.toFixed(2)}`} />
            </StatStrip>

            <TableWrap>
              <Table>
                <thead>
                  <Tr>
                    <Th>Carton</Th>
                    <Th numeric>Stock</Th>
                    <Th numeric>Reorder pt</Th>
                    <Th numeric>7-day avg/day</Th>
                    <Th numeric>5-day demand</Th>
                    <Th numeric>Order qty</Th>
                    <Th numeric>Est. cost</Th>
                    <Th>Trigger</Th>
                    <Th />
                  </Tr>
                </thead>
                <tbody>
                  {reorders.map((r) => (
                    <Tr key={r.carton.id}>
                      <Td>
                        <div className="font-mono font-semibold text-fg">{r.carton.code}</div>
                        <div className="text-xs text-muted">{r.carton.name}</div>
                      </Td>
                      <Td numeric className="font-semibold text-bad">
                        {r.carton.stock}
                      </Td>
                      <Td numeric>{r.carton.reorderPoint}</Td>
                      <Td numeric>{r.dailyAvg.toFixed(2)}</Td>
                      <Td numeric>{r.projectedLeadDemand}</Td>
                      <Td numeric className="font-semibold">
                        {r.suggestedQty}
                      </Td>
                      <Td numeric>${r.estimatedOrderCost.toFixed(2)}</Td>
                      <Td>
                        {r.belowReorderPoint && <Badge tone="bad">Below reorder</Badge>}
                        {!r.belowReorderPoint && r.belowProjectedDemand && <Badge tone="warn">Lead demand</Badge>}
                      </Td>
                      <Td>
                        <AdminOnly>
                          <Button
                            size="sm"
                            variant="secondary"
                            icon={<PackagePlus className="h-3.5 w-3.5" />}
                            disabled={busy}
                            onClick={() => handleReceive(r.carton.id, r.carton.stock, r.suggestedQty)}
                          >
                            Receive +{r.suggestedQty}
                          </Button>
                        </AdminOnly>
                      </Td>
                    </Tr>
                  ))}
                  {reorders.length === 0 && (
                    <Tr>
                      <Td colSpan={9} className="text-center text-muted">
                        All active cartons cover reorder points and 5-day lead demand.
                      </Td>
                    </Tr>
                  )}
                </tbody>
              </Table>
            </TableWrap>
          </div>
        )}
      </DataState>
    </div>
  );
}
