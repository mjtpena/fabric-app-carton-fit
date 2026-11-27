import type { ThemeColors } from '@x10/shared/ui';

export interface BenchPalette {
  isDark: boolean;
  bgTop: string;
  bgBottom: string;
  benchWood: string;
  benchEdge: string;
  lampGlow: string;
  cardboardOuter: string;
  cardboardInner: string;
  cardboardEdge: string;
  frostAir: string;
  kraftPaper: string;
  fragileAmber: string;
  uprightInk: string;
  itemBox: string;
  itemCylinder: string;
  rackWire: string;
  rackChosen: string;
  rackFail: string;
  ok: string;
  warn: string;
  bad: string;
  info: string;
  accent: string;
  fg: string;
  muted: string;
  surface: string;
  line: string;
}

export function buildBenchPalette(colors: ThemeColors): BenchPalette {
  const isDark = colors.dark;
  return {
    isDark,
    bgTop: isDark ? '#211a14' : '#f4ece1',
    bgBottom: isDark ? '#120e0b' : '#e4d6c4',
    benchWood: isDark ? '#3a2c21' : '#c9ae8c',
    benchEdge: isDark ? '#291f17' : '#a88a64',
    lampGlow: isDark ? '#f6c57a' : '#fff1d0',
    cardboardOuter: isDark ? '#9c7852' : '#c69f73',
    cardboardInner: isDark ? '#7d5f3f' : '#b28a5e',
    cardboardEdge: isDark ? '#d8b68c' : '#7b5835',
    frostAir: isDark ? '#a6c8e0' : '#7ca6c4',
    kraftPaper: isDark ? '#d8bd97' : '#dfd0b8',
    fragileAmber: '#d98a1f',
    uprightInk: isDark ? '#e6d7c3' : '#4a3724',
    itemBox: isDark ? '#6f8191' : '#586d80',
    itemCylinder: isDark ? '#7c8f7d' : '#5f7665',
    rackWire: isDark ? '#7e7165' : '#8b7b6b',
    rackChosen: colors.accent[9] || '#a17c56',
    rackFail: isDark ? '#5a4d43' : '#b8a99a',
    ok: colors.ok || '#3d8b6c',
    warn: colors.warn || '#d98a1f',
    bad: colors.bad || '#c25444',
    info: colors.info || '#4a7fa8',
    accent: colors.accent[9] || '#a17c56',
    fg: colors.text,
    muted: colors.muted,
    surface: colors.surface,
    line: colors.line,
  };
}
