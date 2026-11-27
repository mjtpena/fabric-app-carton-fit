import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { AdminOnly, useApp } from '@x10/shared/runtime';
import { useAsync } from '@x10/shared/lib';
import {
  Badge,
  Button,
  DataState,
  Dialog,
  Field,
  InlineError,
  Input,
  PageHeader,
  Stat,
  StatStrip,
  Table,
  TableWrap,
  Td,
  Th,
  Tr,
} from '@x10/shared/ui';

import { createCarton, loadCartonFitSnapshot, updateCartonStock } from '../domain/cartonFit';
import { cartonDimWeightGrams, outerDimensions } from '../domain/packing';
import type { Schema } from '../model';

export function CartonRackPage() {
  const { store, me } = useApp<Schema>();
  const loader = useCallback(() => loadCartonFitSnapshot(store), [store]);
  const state = useAsync(loader, [loader]);

  const [addOpen, setAddOpen] = useState(false);
  const [code, setCode] = useState('CF-GFT');
  const [name, setName] = useState('Holiday Gift Sleeve');
  const [innerLength, setInnerLength] = useState('340');
  const [innerWidth, setInnerWidth] = useState('240');
  const [innerHeight, setInnerHeight] = useState('140');
  const [tareGrams, setTareGrams] = useState('240');
  const [maxLoadGrams, setMaxLoadGrams] = useState('9000');
  const [unitCost, setUnitCost] = useState('0.92');
  const [stock, setStock] = useState('45');
  const [reorderPoint, setReorderPoint] = useState('15');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddCarton = async () => {
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      await createCarton(store, me, {
        code,
        name,
        innerLength: Number(innerLength),
        innerWidth: Number(innerWidth),
        innerHeight: Number(innerHeight),
        tareGrams: Number(tareGrams),
        maxLoadGrams: Number(maxLoadGrams),
        unitCost: Number(unitCost),
        stock: Number(stock),
        reorderPoint: Number(reorderPoint),
        active: true,
      });
      setAddOpen(false);
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to add carton.');
    } finally {
      setBusy(false);
    }
  };

  const handleQuickRestock = async (cartonId: string, currentStock: number) => {
    if (!me) return;
    setBusy(true);
    setError(null);
    try {
      await updateCartonStock(store, me, cartonId, { stock: currentStock + 25 });
      await state.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to restock carton.');
    } finally {
      setBusy(false);
    }
  };

  const cartons = state.data?.cartons ?? [];
  const lowCount = cartons.filter((c) => c.active && c.stock <= c.reorderPoint).length;
  const totalStock = cartons.reduce((acc, c) => acc + c.stock, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Carton rack"
        actions={
          <AdminOnly>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setAddOpen(true)}>
              Add carton
            </Button>
          </AdminOnly>
        }
      />

      {error && <InlineError error={error} />}

      <DataState state={state}>
        {() => (
          <div className="space-y-6">
            <StatStrip>
              <Stat label="Active cartons" value={String(cartons.filter((c) => c.active).length)} />
              <Stat label="Total stock on floor" value={totalStock.toLocaleString()} />
              <Stat label="At or below reorder" value={String(lowCount)} tone={lowCount > 0 ? 'bad' : 'ok'} />
            </StatStrip>

            <TableWrap>
              <Table>
                <thead>
                  <Tr>
                    <Th>Code</Th>
                    <Th>Name</Th>
                    <Th numeric>Inner (mm)</Th>
                    <Th numeric>Outer dim wt</Th>
                    <Th numeric>Max load</Th>
                    <Th numeric>Unit cost</Th>
                    <Th numeric>Stock</Th>
                    <Th>Status</Th>
                    <Th />
                  </Tr>
                </thead>
                <tbody>
                  {cartons.map((c) => {
                    const outer = outerDimensions(c);
                    const dimKg = cartonDimWeightGrams(c) / 1000;
                    const low = c.stock <= c.reorderPoint;
                    return (
                      <Tr key={c.id}>
                        <Td className="font-mono font-semibold text-fg">{c.code}</Td>
                        <Td>{c.name}</Td>
                        <Td numeric>
                          {c.innerLength}×{c.innerWidth}×{c.innerHeight}
                        </Td>
                        <Td numeric title={`Outer ${outer.outerLength}×${outer.outerWidth}×${outer.outerHeight} mm`}>
                          {dimKg.toFixed(2)} kg
                        </Td>
                        <Td numeric>{(c.maxLoadGrams / 1000).toFixed(1)} kg</Td>
                        <Td numeric>${c.unitCost.toFixed(2)}</Td>
                        <Td numeric className={low ? 'font-semibold text-bad' : ''}>
                          {c.stock} / {c.reorderPoint}
                        </Td>
                        <Td>
                          <Badge tone={!c.active ? 'neutral' : low ? 'bad' : 'ok'}>
                            {!c.active ? 'Inactive' : low ? 'Reorder' : 'In stock'}
                          </Badge>
                        </Td>
                        <Td>
                          <AdminOnly>
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => handleQuickRestock(c.id, c.stock)}>
                              +25
                            </Button>
                          </AdminOnly>
                        </Td>
                      </Tr>
                    );
                  })}
                </tbody>
              </Table>
            </TableWrap>
          </div>
        )}
      </DataState>

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Add carton to library">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Code" htmlFor="c-code">
            <Input id="c-code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={12} />
          </Field>
          <Field label="Name" htmlFor="c-name">
            <Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </Field>
          <Field label="Inner length (mm)" htmlFor="c-l">
            <Input id="c-l" type="number" value={innerLength} onChange={(e) => setInnerLength(e.target.value)} />
          </Field>
          <Field label="Inner width (mm)" htmlFor="c-w">
            <Input id="c-w" type="number" value={innerWidth} onChange={(e) => setInnerWidth(e.target.value)} />
          </Field>
          <Field label="Inner height (mm)" htmlFor="c-h">
            <Input id="c-h" type="number" value={innerHeight} onChange={(e) => setInnerHeight(e.target.value)} />
          </Field>
          <Field label="Tare (g)" htmlFor="c-tare">
            <Input id="c-tare" type="number" value={tareGrams} onChange={(e) => setTareGrams(e.target.value)} />
          </Field>
          <Field label="Max load (g)" htmlFor="c-max">
            <Input id="c-max" type="number" value={maxLoadGrams} onChange={(e) => setMaxLoadGrams(e.target.value)} />
          </Field>
          <Field label="Unit cost ($)" htmlFor="c-cost">
            <Input id="c-cost" type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </Field>
          <Field label="Starting stock" htmlFor="c-stock">
            <Input id="c-stock" type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
          </Field>
          <Field label="Reorder point" htmlFor="c-reorder">
            <Input id="c-reorder" type="number" value={reorderPoint} onChange={(e) => setReorderPoint(e.target.value)} />
          </Field>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAddOpen(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={handleAddCarton}>
            Save carton
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
