import { expect, test } from '@playwright/test';
import { openApp } from '@x10/shared/e2e';

test('smoke: loads packing table, creates a carton on carton rack, no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await openApp(page, '/', 'demo-admin');
  await expect(page.getByRole('heading', { name: 'The Packing Table' })).toBeVisible();

  await openApp(page, '/rack', 'demo-admin');
  await expect(page.getByRole('heading', { name: 'Carton rack' })).toBeVisible();
  await page.getByRole('button', { name: 'Add carton' }).click();
  await page.getByLabel('Code').fill('CF-SMK');
  await page.getByLabel('Name').fill('Smoke Test Carton');
  await page.getByRole('button', { name: 'Save carton' }).click();
  await expect(page.getByText('CF-SMK')).toBeVisible();

  // Verify no horizontal overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  expect(errors).toEqual([]);
});
