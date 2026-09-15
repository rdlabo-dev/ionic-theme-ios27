import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 } });

const TOL = 0.75;
const CENTER = { x: 201, y: 451 };
const PRIMARY_BG = 'rgb(2, 137, 255)';
const PRIMARY_FG = 'rgb(255, 255, 255)';
const appearances = ['light', 'dark'] as const;
const optOutClasses = ['ios-theme-disabled', 'ios26-disabled'] as const;

const expectGeom = (actual: number, expected: number, label: string) => {
  expect(Math.abs(actual - expected), `${label}: ${actual} vs ${expected}`).toBeLessThanOrEqual(TOL);
};

const setPaletteDark = async (page: Page, dark: boolean) => {
  await page.evaluate((enabled) => {
    document.documentElement.classList.toggle('ion-palette-dark', enabled);
  }, dark);
};

const waitHydrated = async (overlay: Locator) => {
  await expect.poll(async () => overlay.evaluate((el) => el.classList.contains('hydrated'))).toBe(true);
  await overlay.evaluate(async (el) => {
    const host = el as HTMLElement & { componentOnReady?: () => Promise<unknown> };
    await host.componentOnReady?.();
  });
};

const presentOverlay = async (overlay: Locator) => {
  await overlay.evaluate(async (el) => {
    const host = el as HTMLElement & {
      componentOnReady?: () => Promise<unknown>;
      present: () => Promise<void>;
    };
    await host.componentOnReady?.();
    const didPresent = new Promise<void>((resolve) => {
      host.addEventListener('didPresent', () => resolve(), { once: true });
    });
    await Promise.all([host.present(), didPresent]);
  });
};

const dismissOverlay = async (overlay: Locator) => {
  await overlay.evaluate(async (el) => {
    const host = el as HTMLElement & { dismiss: () => Promise<boolean> };
    await host.dismiss();
  });
};

const boxOf = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('element has no bounding box');
  }
  return box;
};

const mountOverlay = async (page: Page, kind: 'alert' | 'action-sheet', className = ''): Promise<Locator> => {
  const route = kind === 'alert' ? '/main/index/alert' : '/main/index/action-sheet';
  await page.goto(route, { waitUntil: 'networkidle' });
  await expect(page.locator(kind === 'alert' ? 'app-alert' : 'app-action-sheet')).toBeVisible();

  await page.evaluate(
    ({ control, cls }) => {
      document.querySelector('#parity-overlay')?.remove();
      const app = document.querySelector('ion-app');
      if (!app) {
        throw new Error('ion-app not found');
      }
      if (control === 'alert') {
        app.insertAdjacentHTML(
          'beforeend',
          `<ion-alert id="parity-overlay" mode="ios" header="A Short Title Is Best" message="A message should be a short, complete sentence."${cls ? ` class="${cls}"` : ''}></ion-alert>`,
        );
        const alert = document.querySelector('#parity-overlay') as HTMLIonAlertElement;
        alert.buttons = [
          { text: 'Cancel', role: 'cancel' },
          { text: 'OK', role: 'preferred' },
        ];
      } else {
        app.insertAdjacentHTML(
          'beforeend',
          `<ion-action-sheet id="parity-overlay" mode="ios" header="Actions" sub-header="Action Sheet"${cls ? ` class="${cls}"` : ''}></ion-action-sheet>`,
        );
        const sheet = document.querySelector('#parity-overlay') as HTMLIonActionSheetElement;
        sheet.buttons = [
          { text: 'Delete', role: 'destructive' },
          { text: 'Share', role: 'selected' },
          { text: 'Cancel', role: 'cancel' },
        ];
      }
      const host = document.querySelector('#parity-overlay') as HTMLElement;
      host.style.setProperty('--ion-safe-area-top', '62px');
      host.style.setProperty('--ion-safe-area-bottom', '34px');
    },
    { control: kind, cls: className },
  );

  const overlay = page.locator('#parity-overlay');
  await waitHydrated(overlay);
  return overlay;
};

test.describe('iOS26 alert / action-sheet overlay parity', () => {
  for (const kind of ['alert', 'action-sheet'] as const) {
    test(`${kind} reduced motion completes and can reopen`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const overlay = await mountOverlay(page, kind);
      const result = await overlay.evaluate(async (el) => {
        const host = el as HTMLIonAlertElement | HTMLIonActionSheetElement;
        host.animated = true;
        let count = 0;
        host.addEventListener('didPresent', () => count++);
        for (let i = 0; i < 2; i++) {
          if (!host.isConnected) document.querySelector('ion-app')!.append(host);
          await host.present();
          await host.dismiss();
        }
        return { count, hidden: !host.isConnected || host.classList.contains('overlay-hidden') };
      });
      expect(result).toEqual({ count: 2, hidden: true });
    });
  }

  for (const appearance of appearances) {
    test(`alert geometry, inset, buttons, preferred primary (${appearance})`, async ({ page }) => {
      const overlay = await mountOverlay(page, 'alert');
      await setPaletteDark(page, appearance === 'dark');
      await presentOverlay(overlay);

      const wrapper = overlay.locator('.alert-wrapper');
      const box = await boxOf(wrapper);
      expectGeom(box.width, 320, 'alert width');
      expectGeom(box.height, 172, 'alert height');
      expectGeom(box.x + box.width / 2, CENTER.x, 'alert centerX');
      expectGeom(box.y + box.height / 2, CENTER.y, 'alert centerY');
      await expect(wrapper).toHaveCSS('border-radius', '34px');

      const expectedBg = appearance === 'dark' ? 'rgba(62, 62, 62, 0.24)' : 'rgba(255, 255, 255, 0.7)';
      expect(await wrapper.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(expectedBg);

      const head = overlay.locator('.alert-head');
      await expect(head).toHaveCSS('text-align', 'start');
      expect(await head.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe('30px');
      expect(await head.evaluate((el) => getComputedStyle(el).paddingRight)).toBe('30px');

      const buttons = overlay.locator('button.alert-button');
      await expect(buttons).toHaveCount(2);
      await expect(buttons.nth(0)).toHaveText('Cancel');
      await expect(buttons.nth(1)).toHaveText('OK');
      await expect(buttons.nth(1)).toHaveClass(/alert-button-role-preferred/);

      const cancel = await boxOf(buttons.nth(0));
      const ok = await boxOf(buttons.nth(1));
      expectGeom(cancel.height, 48, 'cancel height');
      expectGeom(ok.height, 48, 'ok height');
      expectGeom(ok.x - (cancel.x + cancel.width), 8, 'alert button gap');
      await expect(buttons.nth(1)).toHaveCSS('background-color', PRIMARY_BG);
      await expect(buttons.nth(1)).toHaveCSS('color', PRIMARY_FG);
    });

    test(`action-sheet geometry, selected primary, button size (${appearance})`, async ({ page }) => {
      const overlay = await mountOverlay(page, 'action-sheet');
      await setPaletteDark(page, appearance === 'dark');
      await presentOverlay(overlay);

      const wrapper = overlay.locator('.action-sheet-wrapper');
      const container = overlay.locator('.action-sheet-container');
      const box = await boxOf(wrapper);
      expectGeom(box.width, 320, 'sheet width');
      expectGeom(box.height, 264, 'sheet height');
      expectGeom(box.x + box.width / 2, CENTER.x, 'sheet centerX');
      expectGeom(box.y + box.height / 2, CENTER.y, 'sheet centerY');
      await expect(container).toHaveCSS('border-radius', '34px');

      const expectedBg = appearance === 'dark' ? 'rgba(62, 62, 62, 0.24)' : 'rgba(255, 255, 255, 0.7)';
      expect(await container.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(expectedBg);

      const buttons = overlay.locator('button.action-sheet-button');
      await expect(buttons).toHaveCount(3);
      await expect(buttons.nth(0)).toHaveText('Delete');
      await expect(buttons.nth(1)).toHaveText('Share');
      await expect(buttons.nth(2)).toHaveText('Cancel');
      await expect(buttons.nth(1)).toHaveClass(/action-sheet-selected/);

      const deleteBox = await boxOf(buttons.nth(0));
      const shareBox = await boxOf(buttons.nth(1));
      const cancelBox = await boxOf(buttons.nth(2));
      for (const [label, b] of [
        ['delete', deleteBox],
        ['share', shareBox],
        ['cancel', cancelBox],
      ] as const) {
        expectGeom(b.width, 288, `${label} width`);
        expectGeom(b.height, 48, `${label} height`);
      }
      expectGeom(shareBox.y - (deleteBox.y + deleteBox.height), 8, 'sheet gap delete→share');
      expectGeom(cancelBox.y - (shareBox.y + shareBox.height), 8, 'sheet gap share→cancel');
      await expect(buttons.nth(1)).toHaveCSS('background-color', PRIMARY_BG);
      await expect(buttons.nth(1)).toHaveCSS('color', PRIMARY_FG);
    });
  }

  test('custom --background applies to alert wrapper and action-sheet container', async ({ page }) => {
    for (const kind of ['alert', 'action-sheet'] as const) {
      const overlay = await mountOverlay(page, kind);
      await overlay.evaluate((el) => el.style.setProperty('--background', 'rgb(12, 34, 56)'));
      await presentOverlay(overlay);
      const surface = overlay.locator(kind === 'alert' ? '.alert-wrapper' : '.action-sheet-container');
      await expect(surface).toHaveCSS('background-color', 'rgb(12, 34, 56)');
      await dismissOverlay(overlay);
    }
  });

  for (const optOut of optOutClasses) {
    test(`opt-out ${optOut} skips ios26 radius on alert and action-sheet`, async ({ page }) => {
      for (const kind of ['alert', 'action-sheet'] as const) {
        const overlay = await mountOverlay(page, kind, optOut);
        await presentOverlay(overlay);
        const surface = overlay.locator(kind === 'alert' ? '.alert-wrapper' : '.action-sheet-container');
        await expect(surface).not.toHaveCSS('border-radius', '34px');
        await dismissOverlay(overlay);
      }
    });
  }

  test('RTL keeps start text alignment on alert head and action-sheet title', async ({ page }) => {
    const alert = await mountOverlay(page, 'alert');
    await alert.evaluate((el) => el.setAttribute('dir', 'rtl'));
    await presentOverlay(alert);
    await expect(alert.locator('.alert-head')).toHaveCSS('text-align', 'start');
    await expect(alert.locator('.alert-message')).toHaveCSS('text-align', 'start');
    await dismissOverlay(alert);

    const sheet = await mountOverlay(page, 'action-sheet');
    await sheet.evaluate((el) => el.setAttribute('dir', 'rtl'));
    await presentOverlay(sheet);
    await expect(sheet.locator('.action-sheet-title')).toHaveCSS('text-align', 'start');
  });

  test('single didPresent handler fires once per present across dismiss/reopen', async ({ page }) => {
    const overlay = await mountOverlay(page, 'alert');
    const count = await overlay.evaluate(async (el) => {
      const host = el as HTMLElement & {
        present: () => Promise<void>;
        dismiss: () => Promise<boolean>;
      };
      let n = 0;
      host.addEventListener('didPresent', () => {
        n += 1;
      });
      await host.present();
      await host.dismiss();
      // Imperative Ionic overlays are detached after dismissal.
      document.querySelector('ion-app')!.appendChild(host);
      await host.present();
      await host.dismiss();
      return n;
    });
    expect(count).toBe(2);
  });
});
