import type { DemoScript } from '@x10/shared/demo';

export const script: DemoScript = {
  title: 'Carton Fit: packing and dimensional weight without shipping air',
  persona: 'demo-admin',
  scenes: [
    {
      id: 'hook',
      say: [
        'In holiday peak, packers grab the biggest box on the rack and ship expensive air.',
        'Carton Fit puts the smallest safe carton on the bench under one warm lamp.',
      ],
      async run(h) {
        await h.goto('/', 'demo-admin');
        await h.pause(1400);
      },
    },
    {
      id: 'lenses',
      say: [
        'Switch to the Fragile lens to see twenty-millimetre amber cushion clearances with nothing stacked above glass.',
        'Switch to Stack load to inspect vertical weight pressure on every item in the box.',
      ],
      async run(h) {
        await h.click(h.page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: 'Fragile' }));
        await h.pause(1200);
        await h.click(h.page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: 'Stack load' }));
        await h.pause(1200);
      },
    },
    {
      id: 'today-split',
      say: [
        'The Today panel surfaces orders that need a two-carton split, blocked unverified SKUs, and low stock.',
        'Selecting the split order loads both proposed cartons and their combined billable weight.',
      ],
      async run(h) {
        await h.click(h.page.getByRole('button', { name: /needs a 2-carton split/i }));
        await h.pause(1300);
      },
    },
    {
      id: 'view-as',
      say: [
        'Switching View as between Packer and Engineer shifts the bench from one-click confirmation to engineering controls.',
      ],
      async run(h) {
        await h.click(h.page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: 'Engineer' }));
        await h.pause(900);
        await h.click(h.page.getByRole('radiogroup', { name: 'View as' }).getByRole('radio', { name: 'Packer' }));
        await h.pause(900);
      },
    },
    {
      id: 'weigh-in',
      say: [
        'At the Weigh-in bench, a scale reading more than five percent off expected weight flags the SKU for review.',
        'The packaging engineer verifies dimensions in one click so the order unblocks immediately.',
      ],
      async run(h) {
        await h.goto('/weigh-in', 'demo-admin');
        await h.fill(h.page.getByLabel('Scale reading (g)'), '4900');
        await h.click(h.page.getByRole('button', { name: 'Check scale' }));
        await h.pause(1200);
      },
    },
    {
      id: 'air-bill',
      say: [
        'Air bill tracks billed dimensional weight against actual weight each day and prices every packer override.',
        'Carton Fit runs on Microsoft Fabric Apps so every bench shares one honest carton library.',
      ],
      async run(h) {
        await h.goto('/air-bill', 'demo-admin');
        await h.pause(1400);
      },
    },
  ],
};
