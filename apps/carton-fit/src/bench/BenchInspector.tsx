import { X } from 'lucide-react';
import { Badge, FloatingPanel, IconButton } from '@x10/shared/ui';

import type { Placement } from '../domain/packing';

export interface BenchInspectorProps {
  placement: Placement;
  onClose(): void;
}

export function BenchInspector({ placement, onClose }: BenchInspectorProps) {
  const stackPct =
    placement.stackLimitGrams > 0
      ? Math.round((placement.loadAboveGrams / placement.stackLimitGrams) * 100)
      : placement.fragile
        ? 0
        : 0;

  return (
    <FloatingPanel className="pointer-events-auto w-72 space-y-2 p-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-mono text-[11px] text-muted">{placement.sku}</div>
          <div className="font-semibold text-fg">{placement.name}</div>
        </div>
        <IconButton label="Close item inspector" icon={<X className="h-3.5 w-3.5" />} size="sm" onClick={onClose} />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {placement.fragile && <Badge tone="warn">Fragile (+20 mm cushion)</Badge>}
        {placement.keepUpright && <Badge tone="info">Keep upright</Badge>}
        {!placement.fragile && !placement.keepUpright && <Badge tone="neutral">Standard</Badge>}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 border-t border-line pt-2 font-mono text-[11px]">
        <dt className="text-muted">Item size</dt>
        <dd className="text-right text-fg">
          {placement.rawDx}×{placement.rawDz}×{placement.rawDy} mm
        </dd>
        <dt className="text-muted">Position (x,y,z)</dt>
        <dd className="text-right text-fg">
          {placement.x}, {placement.y}, {placement.z}
        </dd>
        <dt className="text-muted">Weight</dt>
        <dd className="text-right text-fg">{(placement.weightGrams / 1000).toFixed(2)} kg</dd>
        <dt className="text-muted">Load above</dt>
        <dd className="text-right text-fg">
          {placement.loadAboveGrams} g / {placement.stackLimitGrams} g ({stackPct}%)
        </dd>
      </dl>
    </FloatingPanel>
  );
}
