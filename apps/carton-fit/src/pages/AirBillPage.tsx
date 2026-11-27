import { useCallback } from 'react';
import { useApp } from '@x10/shared/runtime';
import { useAsync } from '@x10/shared/lib';
import { SimpleBarChart } from '@x10/shared/charts';
import { Badge, DataState, PageHeader, Section, Stat, StatStrip, Table, TableWrap, Td, Th, Tr } from '@x10/shared/ui';

import { loadCartonFitSnapshot } from '../domain/cartonFit';
import type { Schema } from '../model';

export function AirBillPage() {
  const { store } = useApp<Schema>();
  const loader = useCallback(() => loadCartonFitSnapshot(store), [store]);
  const state = useAsync(loader, [loader]);

  const overrides = (state.data?.orderViews ?? []).filter((ov) => ov.packerOverrodeMoreExpensive);

  return (
    <div className="space-y-6">
      <PageHeader title="Air bill" />

      <DataState state={state}>
        {(snap) => {
          const bill = snap.airBill;
          return (
            <div className="space-y-6">
              <StatStrip>
                <Stat label="Billable weight" value={`${bill.totalBillableKg.toFixed(1)} kg`} />
                <Stat label="Actual weight" value={`${bill.totalActualKg.toFixed(1)} kg`} />
                <Stat label="Air billed (dim − actual)" value={`${bill.totalAirKg.toFixed(1)} kg`} tone="warn" />
                <Stat
                  label="Packer override cost"
                  value={`+$${bill.totalOverrideExtraCost.toFixed(2)}`}
                  tone={bill.overrideCount > 0 ? 'bad' : 'ok'}
                />
              </StatStrip>

              <Section title="Billable vs actual weight by day (kg)">
                <SimpleBarChart
                  title="Daily weight breakdown"
                  summary={`${bill.totalAirKg.toFixed(1)} kg billed air across ${bill.days.length} days`}
                  height={260}
                  data={bill.days as unknown as Record<string, unknown>[]}
                  xKey="day"
                  series={[
                    { key: 'actualKg', label: 'Actual kg' },
                    { key: 'airKg', label: 'Billed air kg' },
                  ]}
                  stacked
                />
              </Section>

              <Section title="Orders where packer chose a costlier carton">
                <TableWrap>
                  <Table>
                    <thead>
                      <Tr>
                        <Th>Order</Th>
                        <Th>Packer carton</Th>
                        <Th>Auto choice</Th>
                        <Th numeric>Void %</Th>
                        <Th numeric>Extra cost</Th>
                      </Tr>
                    </thead>
                    <tbody>
                      {overrides.map((ov) => (
                        <Tr key={ov.order.id}>
                          <Td className="font-mono font-medium">{ov.order.ref}</Td>
                          <Td className="font-mono">{ov.activeCarton?.code ?? '—'}</Td>
                          <Td className="font-mono">
                            <Badge tone="ok">{ov.autoChoice.chosen?.carton.code ?? '—'}</Badge>
                          </Td>
                          <Td numeric>{ov.activeVoidPct.toFixed(1)}%</Td>
                          <Td numeric className="font-semibold text-bad">
                            +${ov.overrideExtraCost.toFixed(2)}
                          </Td>
                        </Tr>
                      ))}
                      {overrides.length === 0 && (
                        <Tr>
                          <Td colSpan={5} className="text-center text-muted">
                            Every packed order matched the optimal carton cost.
                          </Td>
                        </Tr>
                      )}
                    </tbody>
                  </Table>
                </TableWrap>
              </Section>
            </div>
          );
        }}
      </DataState>
    </div>
  );
}
