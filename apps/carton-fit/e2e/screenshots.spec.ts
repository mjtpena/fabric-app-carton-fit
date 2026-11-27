/**
 * Capture the 6 high-signal screenshots for Carton Fit.
 * Run: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
 */
import { test } from '@playwright/test';
import { openApp } from '@x10/shared/e2e';

const ENABLED = Boolean(process.env.SCREENSHOTS);

test.describe('Carton Fit redesign screenshots', () => {
  test('desktop-light-stage', async ({ page }, info) => {
    test.skip(!ENABLED || info.project.name !== 'desktop', 'desktop screenshot only');
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page, '/', 'demo-admin');
    await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'docs/redesign/desktop-light-stage.png' });
  });

  test('desktop-dark-stage', async ({ page }, info) => {
    test.skip(!ENABLED || info.project.name !== 'desktop', 'desktop screenshot only');
    await page.emulateMedia({ colorScheme: 'dark' });
    await openApp(page, '/', 'demo-admin');
    await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'docs/redesign/desktop-dark-stage.png' });
  });

  test('desktop-lens', async ({ page }, info) => {
    test.skip(!ENABLED || info.project.name !== 'desktop', 'desktop screenshot only');
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page, '/?nowebgl=1', 'demo-admin');
    await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
    await page.getByRole('radiogroup', { name: 'Lens' }).getByRole('radio', { name: 'Fragile' }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: 'docs/redesign/desktop-lens.png' });
  });

  test('desktop-tool', async ({ page }, info) => {
    test.skip(!ENABLED || info.project.name !== 'desktop', 'desktop screenshot only');
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page, '/air-bill', 'demo-admin');
    await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
    await page.waitForTimeout(700);
    await page.screenshot({ path: 'docs/redesign/desktop-tool.png' });
  });

  test('phone-light-stage', async ({ page }, info) => {
    test.skip(!ENABLED || info.project.name !== 'phone', 'phone screenshot only');
    await page.emulateMedia({ colorScheme: 'light' });
    await openApp(page, '/', 'demo-admin');
    await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'docs/redesign/phone-light-stage.png' });
  });

  test('phone-dark-stage', async ({ page }, info) => {
    test.skip(!ENABLED || info.project.name !== 'phone', 'phone screenshot only');
    await page.emulateMedia({ colorScheme: 'dark' });
    await openApp(page, '/', 'demo-admin');
    await page.getByTestId('demo-banner').getByRole('button').first().click().catch(() => undefined);
    await page.waitForTimeout(900);
    await page.screenshot({ path: 'docs/redesign/phone-dark-stage.png' });
  });
});
