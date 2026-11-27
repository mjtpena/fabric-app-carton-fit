/**
 * App configuration. No React/JSX imports here: tools/seed-fabric.mjs loads this file in Node.
 */
import type { Persona } from '@x10/shared/identity';
import type { AppConfig } from '@x10/shared/runtime';

import { defs, type Schema } from './model';
import { seed } from './seed';

export const personas: Persona[] = [
  { sub: 'demo-admin', name: 'Nadia Lindholm', email: 'nadia@example.com', isAdmin: true, role: 'Packaging engineer' },
  { sub: 'demo-packer-1', name: 'Devon Brooks', email: 'devon@example.com', isAdmin: false, role: 'Packer' },
  { sub: 'demo-packer-2', name: 'Priya Nair', email: 'priya@example.com', isAdmin: false, role: 'Packer' },
];

export const config: AppConfig<Schema> = {
  appId: 'carton-fit',
  title: 'Carton Fit',
  tagline: 'Smallest safe carton, honest dim weight, zero air billed',
  accent: 'bronze',
  logoPaths: [
    'M12 2.5L20.5 7.2V16.8L12 21.5L3.5 16.8V7.2L12 2.5Z',
    'M12 12L20.5 7.2',
    'M12 12L3.5 7.2',
    'M12 12V21.5',
    'M7.8 4.9L16.2 9.6',
  ],
  defs,
  personas,
  seed,
  nav: [
    { to: '/', label: 'Packing table', end: true },
    { to: '/rack', label: 'Carton rack' },
    { to: '/weigh-in', label: 'Weigh-in' },
    { to: '/air-bill', label: 'Air bill' },
    { to: '/reorder', label: 'Reorder slip' },
    { to: '/about', label: 'About' },
  ],
};
