import { useState } from 'react';
import { Badge, FilterSelect, SearchInput, Table, TableWrap, Td, Th, Toolbar, Tr } from '@x10/shared/ui';

import type { OrderView } from '../domain/cartonFit';

export interface BenchListProps {
  orderViews: OrderView[];
  onSelectOrder(orderId: string): void;
}

export function BenchList({ orderViews, onSelectOrder }: BenchListProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = orderViews.filter((ov) => {
    if (statusFilter !== 'all' && ov.order.status !== statusFilter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const hit =
        ov.order.ref.toLowerCase().includes(q) ||
        (ov.activeCarton?.code.toLowerCase().includes(q) ?? false) ||
        ov.skus.some((s) => s.sku.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
      if (!hit) return false;
    }
    return true;
  });

  return (
    <div className="space-y-3" data-testid="bench-list">
      <Toolbar>
        <SearchInput value={query} onChange={setQuery} placeholder="Search order ref, carton, or SKU" />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'all', label: 'All orders' },
            { value: 'open', label: 'Open' },
            { value: 'packed', label: 'Packed' },
          ]}
        />
      </Toolbar>

      <TableWrap>
        <Table>
          <thead>
            <Tr>
              <Th>Order</Th>
              <Th>Status</Th>
              <Th>Carton</Th>
              <Th numeric>Units</Th>
              <Th numeric>Void %</Th>
              <Th numeric>Actual kg</Th>
              <Th numeric>Dim kg</Th>
              <Th numeric>Billable kg</Th>
            </Tr>
          </thead>
          <tbody>
            {filtered.map((ov) => (
              <Tr
                key={ov.order.id}
                onClick={() => onSelectOrder(ov.order.id)}
                className="cursor-pointer hover:bg-accent-3/40"
              >
                <Td className="font-mono font-medium text-fg">
                  {ov.order.ref}
                  {ov.needsSplit && (
                    <Badge tone="info" className="ml-2">
                      2-box split
                    </Badge>
                  )}
                  {ov.unverifiedSkus.length > 0 && (
                    <Badge tone="warn" className="ml-2">
                      Unverified SKU
                    </Badge>
                  )}
                </Td>
                <Td>
                  <Badge tone={ov.order.status === 'packed' ? 'ok' : 'info'}>
                    {ov.order.status === 'packed' ? 'Packed' : 'Open'}
                  </Badge>
                </Td>
                <Td className="font-mono">
                  {ov.needsSplit
                    ? ov.autoChoice.split?.boxes.map((b) => b.candidate.carton.code).join(' + ')
                    : ov.activeCarton?.code ?? '—'}
                </Td>
                <Td numeric data-testid={`list-units-${ov.order.ref}`}>
                  {ov.unitCount}
                </Td>
                <Td numeric>{ov.activeVoidPct.toFixed(1)}%</Td>
                <Td numeric>{(ov.activeActualGrams / 1000).toFixed(2)}</Td>
                <Td numeric>{(ov.activeDimGrams / 1000).toFixed(2)}</Td>
                <Td numeric className="font-semibold">
                  {(ov.activeBillableGrams / 1000).toFixed(2)}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
