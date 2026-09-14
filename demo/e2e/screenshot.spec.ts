import { test, expect } from '@playwright/test';
import { actionSheetTypes, alertTypes, colorTypes, loadingTypes, modalTypes, selectTypes, toastTypes } from '../src/app/overlay-types';
import type { Page } from 'playwright-core';

/**
 * Screenshot tests for all routes defined in index.routes.ts
 *
 * This test suite captures full-page screenshots for each route
 * to ensure visual consistency across the application.
 */

interface IPath {
  path: string;
  name: string;
}

const typesPath = (path: IPath, types: string[]): IPath[] => {
  return types.map((type) => ({ path: `${path.path}?type=${type}`, name: `${path.name}:${type}` }));
};

const routes = [
  ...typesPath({ path: '/main/index/action-sheet', name: 'action-sheet' }, actionSheetTypes),
  ...typesPath({ path: '/main/index/alert', name: 'alert' }, alertTypes),
  { path: '/main/index/button', name: 'button' },
  { path: '/main/index/checkbox', name: 'checkbox' },
  { path: '/main/index/range', name: 'range' },
  ...typesPath({ path: '/main/index/toast', name: 'toast' }, toastTypes),
  ...typesPath({ path: '/main/index/toast', name: 'toast' }, colorTypes),
  { path: '/main/index/toggle', name: 'toggle' },
  { path: '/main/index/segment', name: 'segment' },
  ...typesPath({ path: '/main/index/modal', name: 'modal' }, modalTypes),
  { path: '/main/index/card', name: 'card' },
  { path: '/main/index/chip', name: 'chip' },
  { path: '/main/index/breadcrumbs', name: 'breadcrumbs' },
  { path: '/main/index/searchbar', name: 'searchbar' },
  { path: '/main/index/popover', name: 'popover' },
  ...typesPath({ path: '/main/index/progress-indicators', name: 'progress-indicators' }, loadingTypes),
  { path: '/main/index/floating-action-button', name: 'floating-action-button' },
  { path: '/main/index/floating-action-button-fixed', name: 'floating-action-button-fixed' },
  ...typesPath({ path: '/main/index/select', name: 'select' }, selectTypes),
  { path: '/main/index/radio', name: 'radio' },
  { path: '/main/index/date-and-time-pickers', name: 'date-and-time-pickers' },
  { path: '/main/index/accordion', name: 'accordion' },
  { path: '/main/index/inputs', name: 'inputs' },
  { path: '/main/index/item-list', name: 'item-list' },
  { path: '/main/index/reorder', name: 'reorder' },
  { path: '/main/index/tabs', name: 'tabs' },
  { path: '/main/index/toolbar', name: 'toolbar' },
].sort(() => Math.random() - 0.5);

const prepareScreenShot = async (page: Page, routeName: string) => {
  await page.waitForTimeout(1000);
  await page.waitForSelector('ion-content[role="main"]', { timeout: 10000 });
  if (!routeName.includes(':')) {
    const scrollHeight = await page.locator('ion-content[role="main"]').evaluate(async (el: any) => {
      const scrollEl = await el.getScrollElement();
      return scrollEl.scrollHeight;
    });
    await page.setViewportSize({ width: 1200, height: scrollHeight });
  }
};

test.describe('Screenshot Tests - All Routes', () => {
  for (const route of routes) {
    test(`should match screenshot for ${route.name}`, async ({ page }) => {
      // Set E2E testing flag to disable animations
      await page.addInitScript(() => ((window as any).IONIC_E2E_TESTING = true));
      await page.goto(route.path, { waitUntil: 'networkidle' });
      await prepareScreenShot(page, route.name);
      await expect(page).toHaveScreenshot(`${route.name}.png`, {
        fullPage: true,
        // Finishing a paused sheet gesture also collapses its visible content.
        animations: route.name === 'modal:sheet' ? 'allow' : 'disabled',
        mask: [page.locator('ion-spinner')],
      });
    });
  }
});

test.describe('Screenshot Tests - Dark Mode', () => {
  for (const route of routes) {
    test(`should match dark mode screenshot for ${route.name}`, async ({ page }) => {
      // Set E2E testing flag to disable animations
      await page.addInitScript(() => ((window as any).IONIC_E2E_TESTING = true));
      await page.goto(route.path, { waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        document.documentElement.classList.add('ion-palette-dark');
      });
      await prepareScreenShot(page, route.name);
      await expect(page).toHaveScreenshot(`${route.name}-dark.png`, {
        fullPage: true,
        animations: route.name === 'modal:sheet' ? 'allow' : 'disabled',
        mask: [page.locator('ion-spinner')],
      });
    });
  }
});
