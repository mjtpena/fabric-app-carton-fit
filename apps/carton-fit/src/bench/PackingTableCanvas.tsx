/** Default export so Three.js is lazy-loaded into its own chunk. */
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { useThemeColors } from '@x10/shared/ui';

import type { CartonCandidate, Placement } from '../domain/packing';
import type { BenchLens } from '../domain/today';
import type { Carton } from '../model';
import { PackingTableScene } from './PackingTableScene';
import { buildBenchPalette } from './theme';

export interface PackingTableApi {
  zoom(factor: number): void;
  reset(): void;
}

export interface PackingTableCanvasProps {
  carton: Carton | null;
  placements: Placement[];
  candidates: CartonCandidate[];
  chosenCartonId: string | null;
  lens: BenchLens;
  visibleCount: number;
  focusUnitIndex: number | null;
  shiftPx: number;
  reduced: boolean;
  label: string;
  onPickUnit(unitIndex: number | null): void;
  onPickCarton(cartonId: string): void;
  onError(message: string): void;
  apiRef?: Ref<PackingTableApi | null>;
}

export default function PackingTableCanvas({
  carton,
  placements,
  candidates,
  chosenCartonId,
  lens,
  visibleCount,
  focusUnitIndex,
  shiftPx,
  reduced,
  label,
  onPickUnit,
  onPickCarton,
  onError,
  apiRef,
}: PackingTableCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const scene = useRef<PackingTableScene | null>(null);
  const [ready, setReady] = useState(false);
  const colors = useThemeColors();

  const pickUnitRef = useRef(onPickUnit);
  pickUnitRef.current = onPickUnit;
  const pickCartonRef = useRef(onPickCarton);
  pickCartonRef.current = onPickCarton;
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    const s = new PackingTableScene(host.current!, overlay.current!, {
      onPickUnit: (idx) => pickUnitRef.current(idx),
      onPickCarton: (id) => pickCartonRef.current(id),
      onReady: () => setReady(true),
      onError: (msg) => errRef.current(msg),
    });
    scene.current = s;
    return () => {
      s.dispose();
      scene.current = null;
    };
  }, []);

  useEffect(() => {
    scene.current?.setTheme(buildBenchPalette(colors));
  }, [colors]);

  useEffect(() => {
    scene.current?.setData({
      carton,
      placements,
      candidates,
      chosenCartonId,
      lens,
      visibleCount,
      focusUnitIndex,
    });
  }, [carton, placements, candidates, chosenCartonId, lens, visibleCount, focusUnitIndex]);

  useEffect(() => {
    scene.current?.setShift(shiftPx);
  }, [shiftPx]);

  useEffect(() => {
    scene.current?.setReduced(reduced);
  }, [reduced]);

  useImperativeHandle(
    apiRef,
    () => ({
      zoom: (f: number) => scene.current?.zoom(f),
      reset: () => scene.current?.resetCamera(),
    }),
    [],
  );

  return (
    <div
      ref={host}
      role="group"
      aria-label={label}
      className="absolute inset-0 overflow-hidden"
      data-testid="packing-table-canvas"
      data-renderer="webgl"
      data-ready={ready ? 'true' : 'false'}
      data-unit-count={placements.length}
    >
      <div ref={overlay} className="pointer-events-none absolute inset-0 overflow-hidden" />
    </div>
  );
}
