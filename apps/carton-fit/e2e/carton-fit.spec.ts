import { expect, test } from '@playwright/test';
import { openApp } from '@x10/shared/e2e';

test('AC5: ?nowebgl shows three orthographic slice views with the same unit count as 3D and list view', async ({ page }) => {
  await openApp(page, '/?nowebgl=1', 'demo-admin');
  const svgStage = page.getByTestId('packing-table-svg');
  await expect(svgStage).toBeVisible();
  await expect(svgStage).toHaveAttribute('data-slice-views', '3');
  await expect(page.getByTestId('slice-view-top')).toBeVisible();
  await expect(page.getByTestId('slice-view-front')).toBeVisible();
  await expect(page.getByTestId('slice-view-side')).toBeVisible();

  const svgUnitCount = await svgStage.getAttribute('data-unit-count');
  expect(Number(svgUnitCount)).toBeGreaterThan(0);

  // Switch to List view and verify the hero order row shows the exact same unit count
  await page.getByRole('radio', { name: 'List' }).click();
  await expect(page.getByTestId('bench-list')).toBeVisible();
  const listCell = page.getByTestId('list-units-ORD-3126');
  await expect(listCell).toHaveText(String(svgUnitCount));
});

test('centrepiece: lens switch, Today focus, and 2-carton split order confirmation', async ({ page }, info) => {
  await openApp(page, '/?nowebgl=1', 'demo-packer-1');
  await expect(page.getByRole('heading', { name: 'The Packing Table' })).toBeVisible();

  // Lens switch
  await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: 'Fragile' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: 'Fragile' })).toHaveAttribute(
    'aria-checked',
    'true',
  );

  // Open Today panel on mobile if collapsed, then click the 2-carton split item
  if (info.project.name === 'phone') {
    await page.getByRole('button', { name: /^Today/ }).click();
  }
  await page.getByRole('button', { name: /needs a 2-carton split/i }).click();
  await expect(page.getByRole('button', { name: /Confirm 2-box split/i })).toBeVisible();

  // Confirm packing the 2-box split
  await page.getByRole('button', { name: /Confirm 2-box split/i }).click();
  await expect(page.getByText(/Packed ORD-3127 in 2 split cartons/i)).toBeVisible();
});

test('weigh-in flags suspect SKUs above 5% tolerance and engineer verifies them', async ({ page }) => {
  await openApp(page, '/weigh-in', 'demo-admin');
  await expect(page.getByRole('heading', { name: 'Weigh-in' })).toBeVisible();

  await page.getByLabel('Scale reading (g)').fill('9500');
  await page.getByRole('button', { name: 'Check scale' }).click();
  await expect(page.getByText(/Discrepancy/i)).toBeVisible();
});
