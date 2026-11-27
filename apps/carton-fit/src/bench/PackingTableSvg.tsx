import { useThemeColors } from '@x10/shared/ui';

import type { CartonCandidate, Placement } from '../domain/packing';
import type { BenchLens } from '../domain/today';
import type { Carton } from '../model';
import { buildBenchPalette, type BenchPalette } from './theme';

export interface PackingTableSvgProps {
  carton: Carton | null;
  placements: Placement[];
  candidates: CartonCandidate[];
  chosenCartonId: string | null;
  lens: BenchLens;
  visibleCount: number;
  focusUnitIndex: number | null;
  label: string;
  onPickUnit(unitIndex: number | null): void;
  onPickCarton(cartonId: string): void;
}

function unitColor(p: Placement, lens: BenchLens, pal: BenchPalette): string {
  switch (lens) {
    case 'fragile':
      return p.fragile ? pal.fragileAmber : pal.isDark ? '#4d535a' : '#8a9199';
    case 'stack': {
      if (p.fragile) return pal.fragileAmber;
      const ratio = p.stackLimitGrams > 0 ? p.loadAboveGrams / p.stackLimitGrams : 0;
      if (ratio > 0.75) return pal.bad;
      if (ratio > 0.35) return pal.warn;
      return pal.ok;
    }
    case 'void':
      return p.fragile ? pal.fragileAmber : pal.isDark ? '#69727c' : '#7b8794';
    case 'billable':
      return p.weightGrams > 1000 ? pal.accent : pal.info;
    case 'stock':
      return p.isCylinder ? pal.itemCylinder : pal.itemBox;
  }
}

interface SliceViewProps {
  id: string;
  title: string;
  axisLabel: string;
  boxW: number;
  boxH: number;
  placements: Placement[];
  lens: BenchLens;
  pal: BenchPalette;
  focusUnitIndex: number | null;
  project: (p: Placement) => { x: number; y: number; w: number; h: number };
  onPickUnit: (idx: number | null) => void;
}

function OrthographicSlice({
  id,
  title,
  axisLabel,
  boxW,
  boxH,
  placements,
  lens,
  pal,
  focusUnitIndex,
  project,
  onPickUnit,
}: SliceViewProps) {
  const pad = 28;
  const viewW = 280;
  const viewH = 220;
  const scale = Math.min((viewW - pad * 2) / Math.max(1, boxW), (viewH - pad * 2 - 14) / Math.max(1, boxH));
  const drawW = boxW * scale;
  const drawH = boxH * scale;
  const ox = (viewW - drawW) / 2;
  const oy = (viewH - drawH) / 2 + 6;

  return (
    <div
      data-testid={`slice-view-${id}`}
      className="flex flex-col rounded-xl border border-line bg-surface/85 p-2.5 backdrop-blur-sm"
    >
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-semibold text-fg">{title}</span>
        <span className="font-mono text-[11px] text-muted">{axisLabel}</span>
      </div>
      <svg
        viewBox={`0 0 ${viewW} ${viewH}`}
        className="h-44 w-full"
        role="img"
        aria-label={`${title} (${placements.length} units)`}
      >
        <defs>
          <pattern id={`void-hatch-${id}`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="8"
              stroke={pal.frostAir}
              strokeOpacity={lens === 'void' ? 0.45 : 0.22}
              strokeWidth="2"
            />
          </pattern>
        </defs>

        {/* Outer cardboard wall */}
        <rect
          x={ox - 4}
          y={oy - 4}
          width={drawW + 8}
          height={drawH + 8}
          rx={3}
          fill={pal.cardboardOuter}
          fillOpacity={0.28}
          stroke={pal.cardboardEdge}
          strokeWidth={1.5}
        />

        {/* Inner carton void area */}
        <rect
          x={ox}
          y={oy}
          width={drawW}
          height={drawH}
          fill={`url(#void-hatch-${id})`}
          stroke={pal.cardboardEdge}
          strokeWidth={1}
          strokeDasharray="3 2"
        />

        {/* Placed units */}
        {placements.map((p) => {
          const rect = project(p);
          const rx = ox + rect.x * scale;
          const ry = oy + rect.y * scale;
          const rw = Math.max(4, rect.w * scale);
          const rh = Math.max(4, rect.h * scale);
          const fill = unitColor(p, lens, pal);
          const focused = focusUnitIndex === p.unitIndex;

          return (
            <g
              key={p.unitIndex}
              data-unit-index={p.unitIndex}
              className="cursor-pointer"
              onClick={() => onPickUnit(focused ? null : p.unitIndex)}
            >
              <rect
                x={rx + 1}
                y={ry + 1}
                width={Math.max(2, rw - 2)}
                height={Math.max(2, rh - 2)}
                rx={p.isCylinder ? Math.min(rw, rh) * 0.35 : 2}
                fill={fill}
                fillOpacity={0.86}
                stroke={focused ? pal.fg : p.fragile ? pal.fragileAmber : pal.cardboardEdge}
                strokeWidth={focused ? 2.4 : p.fragile ? 1.8 : 0.9}
                strokeDasharray={p.fragile ? '4 2' : undefined}
              />
              {rw > 26 && rh > 16 && (
                <text
                  x={rx + rw / 2}
                  y={ry + rh / 2 + 3}
                  textAnchor="middle"
                  fontSize="9"
                  fontFamily="monospace"
                  fill="#ffffff"
                  pointerEvents="none"
                >
                  {p.sku.slice(0, 7)}
                </text>
              )}
            </g>
          );
        })}

        {/* Dimension labels */}
        <text x={ox + drawW / 2} y={oy + drawH + 16} textAnchor="middle" fontSize="10" fontFamily="monospace" fill={pal.muted}>
          {boxW} mm
        </text>
        <text
          x={ox - 10}
          y={oy + drawH / 2}
          textAnchor="middle"
          fontSize="10"
          fontFamily="monospace"
          fill={pal.muted}
          transform={`rotate(-90 ${ox - 10} ${oy + drawH / 2})`}
        >
          {boxH} mm
        </text>
      </svg>
    </div>
  );
}

/**
 * Complete ?nowebgl / reduced-motion fallback: three orthographic slice views (Top, Front, Side)
 * with identical placements and candidate carton strip.
 */
export function PackingTableSvg({
  carton,
  placements,
  candidates,
  chosenCartonId,
  lens,
  visibleCount,
  focusUnitIndex,
  label,
  onPickUnit,
  onPickCarton,
}: PackingTableSvgProps) {
  const colors = useThemeColors();
  const pal = buildBenchPalette(colors);
  const shown = placements.slice(0, Math.min(visibleCount, placements.length));

  if (!carton) {
    return (
      <div className="flex h-full w-full items-center justify-center p-8 text-sm text-muted">
        Select an order to inspect orthographic packing slices.
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={label}
      data-testid="packing-table-svg"
      data-renderer="svg"
      data-slice-views="3"
      data-unit-count={placements.length}
      className="flex h-full w-[calc(100%-var(--side-w,0px))] flex-col justify-center gap-3 overflow-y-auto px-4 pb-24 pt-24 md:px-8"
    >
      {/* Candidate carton rack strip (centered around chosen carton) */}
      <div className="flex flex-wrap items-center gap-1.5" aria-label="Candidate carton rack">
        {(() => {
          const active = candidates.filter((c) => c.carton.active);
          const idx = active.findIndex((c) => c.carton.id === chosenCartonId);
          const start = idx >= 0 && active.length > 6 ? Math.max(0, Math.min(active.length - 6, idx - 2)) : 0;
          return active.slice(start, start + 6);
        })().map((cand) => {
            const chosen = cand.carton.id === chosenCartonId;
            return (
              <button
                key={cand.carton.id}
                type="button"
                disabled={!cand.fits}
                onClick={() => onPickCarton(cand.carton.id)}
                className={`min-h-8 rounded-lg border px-2.5 py-1 font-mono text-xs transition ${
                  chosen
                    ? 'border-accent-9 bg-accent-9 text-white shadow-sm'
                    : cand.fits
                      ? 'border-line bg-surface/85 text-fg hover:border-accent-8'
                      : 'border-line/60 bg-surface/40 text-muted line-through opacity-65'
                }`}
              >
                {cand.carton.code} · {(cand.billableGrams / 1000).toFixed(1)} kg
              </button>
            );
          })}
      </div>

      {/* Three orthographic slice views: Top (XZ), Front (XY), Side (ZY) */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <OrthographicSlice
          id="top"
          title="Top slice (plan)"
          axisLabel={`L ${carton.innerLength} × W ${carton.innerWidth}`}
          boxW={carton.innerLength}
          boxH={carton.innerWidth}
          placements={shown}
          lens={lens}
          pal={pal}
          focusUnitIndex={focusUnitIndex}
          project={(p) => ({ x: p.x, y: p.z, w: p.dx, h: p.dz })}
          onPickUnit={onPickUnit}
        />
        <OrthographicSlice
          id="front"
          title="Front elevation"
          axisLabel={`L ${carton.innerLength} × H ${carton.innerHeight}`}
          boxW={carton.innerLength}
          boxH={carton.innerHeight}
          placements={shown}
          lens={lens}
          pal={pal}
          focusUnitIndex={focusUnitIndex}
          project={(p) => ({ x: p.x, y: carton.innerHeight - (p.y + p.dy), w: p.dx, h: p.dy })}
          onPickUnit={onPickUnit}
        />
        <OrthographicSlice
          id="side"
          title="Side elevation"
          axisLabel={`W ${carton.innerWidth} × H ${carton.innerHeight}`}
          boxW={carton.innerWidth}
          boxH={carton.innerHeight}
          placements={shown}
          lens={lens}
          pal={pal}
          focusUnitIndex={focusUnitIndex}
          project={(p) => ({ x: p.z, y: carton.innerHeight - (p.y + p.dy), w: p.dz, h: p.dy })}
          onPickUnit={onPickUnit}
        />
      </div>
    </div>
  );
}
