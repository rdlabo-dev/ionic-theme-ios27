import { expect, test, type Locator, type Page } from '@playwright/test';

/** Demo theme primary brightness (`demo/src/theme/variables.scss`). Not an iOS 27 value. */
const PRIMARY_BRIGHTNESS = '#96feff';
const SECONDARY_BRIGHTNESS = '#ffb347';
const DANGER_BRIGHTNESS = '#ff6b8a';
const LEGACY_RGB = { channels: '120, 220, 180', hex: '#78dcb4' } as const;

type NativeAppearance = {
  color: string;
  borderTopColor: string;
  borderStyle: string;
  borderWidth: string;
};

const appearances = ['light', 'dark'] as const;
const submitKinds = [
  { kind: 'type=submit', attrs: 'type="submit"' },
  { kind: 'class=button-submit', attrs: 'class="button-submit"' },
] as const;

const resolveCssColor = (page: Page, color: string) =>
  page.evaluate((value) => {
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return resolved;
  }, color);

const setPaletteDark = async (page: Page, dark: boolean) => {
  await page.evaluate((enabled) => {
    document.documentElement.classList.toggle('ion-palette-dark', enabled);
  }, dark);
};

const setRootVars = async (page: Page, vars: Record<string, string>) => {
  await page.evaluate((entries) => {
    const root = document.documentElement;
    for (const [name, value] of Object.entries(entries)) {
      root.style.setProperty(name, value);
    }
  }, vars);
};

const appendFixtureButtons = async (page: Page, markup: string) => {
  await page.evaluate((html) => {
    const wrap = document.createElement('div');
    wrap.id = 'ios26-submit-brightness-fixture';
    wrap.style.cssText = 'position:fixed;top:120px;left:24px;z-index:10000';
    wrap.innerHTML = html;
    document.body.appendChild(wrap);
  }, markup);
};

const waitHydrated = async (button: Locator) => {
  await expect(button).toBeVisible();
  await expect.poll(async () => button.evaluate((el) => el.classList.contains('hydrated'))).toBe(true);
};

const readNativeAppearance = async (button: Locator): Promise<NativeAppearance> => {
  return button.evaluate((el) => {
    const native = el.shadowRoot?.querySelector('.button-native') ?? el.shadowRoot?.querySelector('button');
    if (!native) {
      throw new Error('shadow native button not found');
    }
    const style = getComputedStyle(native);
    return {
      color: style.color,
      borderTopColor: style.borderTopColor,
      borderStyle: style.borderTopStyle,
      borderWidth: style.borderTopWidth,
    };
  });
};

const expectBrightnessAppearance = async (page: Page, button: Locator, brightness: string) => {
  await waitHydrated(button);
  const expected = await resolveCssColor(page, brightness);
  const appearance = await readNativeAppearance(button);
  expect(appearance.color).toBe(expected);
  expect(appearance.borderTopColor).toBe(expected);
  expect(appearance.borderStyle).toBe('solid');
  expect(parseFloat(appearance.borderWidth)).toBeGreaterThan(0);
};

const expectNotBrightnessAppearance = async (page: Page, button: Locator, brightness: string) => {
  await waitHydrated(button);
  const expected = await resolveCssColor(page, brightness);
  const appearance = await readNativeAppearance(button);
  expect(appearance.color).not.toBe(expected);
  expect(appearance.borderTopColor).not.toBe(expected);
};

test.describe('iOS26 submit-button brightness contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/main/index/button', { waitUntil: 'networkidle' });
    await page.waitForSelector('ion-content[role="main"], ion-content', { timeout: 10000 });
  });

  for (const appearance of appearances) {
    for (const submit of submitKinds) {
      test(`primary brightness styles enabled solid submit (${appearance}, ${submit.kind})`, async ({ page }) => {
        await setPaletteDark(page, appearance === 'dark');
        await appendFixtureButtons(
          page,
          [
            `<ion-button id="primary-enabled" fill="solid" color="primary" ${submit.attrs}>Primary</ion-button>`,
            `<ion-button id="default-enabled" fill="solid" ${submit.attrs}>Default</ion-button>`,
          ].join(''),
        );

        await expectBrightnessAppearance(page, page.locator('#primary-enabled'), PRIMARY_BRIGHTNESS);
        await expectBrightnessAppearance(page, page.locator('#default-enabled'), PRIMARY_BRIGHTNESS);
      });

      test(`disabled solid submit does not use enabled brightness (${appearance}, ${submit.kind})`, async ({ page }) => {
        await setPaletteDark(page, appearance === 'dark');
        await appendFixtureButtons(
          page,
          [
            `<ion-button id="primary-enabled" fill="solid" color="primary" ${submit.attrs}>Enabled</ion-button>`,
            `<ion-button id="primary-disabled" fill="solid" color="primary" ${submit.attrs} disabled>Disabled</ion-button>`,
          ].join(''),
        );

        await expectBrightnessAppearance(page, page.locator('#primary-enabled'), PRIMARY_BRIGHTNESS);
        await expectNotBrightnessAppearance(page, page.locator('#primary-disabled'), PRIMARY_BRIGHTNESS);
      });
    }

    test(`secondary and danger explicit brightness variables (${appearance})`, async ({ page }) => {
      await setPaletteDark(page, appearance === 'dark');
      await setRootVars(page, {
        '--ion-color-secondary-brightness': SECONDARY_BRIGHTNESS,
        '--ion-color-danger-brightness': DANGER_BRIGHTNESS,
      });
      await appendFixtureButtons(
        page,
        [
          `<ion-button id="secondary-submit" fill="solid" color="secondary" type="submit">Secondary</ion-button>`,
          `<ion-button id="danger-submit" fill="solid" color="danger" class="button-submit">Danger</ion-button>`,
        ].join(''),
      );

      await expectBrightnessAppearance(page, page.locator('#secondary-submit'), SECONDARY_BRIGHTNESS);
      await expectBrightnessAppearance(page, page.locator('#danger-submit'), DANGER_BRIGHTNESS);
    });

    test(`legacy --ion-color-*-brightness-rgb alias remains functional (${appearance})`, async ({ page }) => {
      await setPaletteDark(page, appearance === 'dark');
      // Clear any direct brightness override so the default-variables rgb alias resolves.
      await setRootVars(page, {
        '--ion-color-secondary-brightness-rgb': LEGACY_RGB.channels,
      });
      await page.evaluate(() => {
        document.documentElement.style.removeProperty('--ion-color-secondary-brightness');
      });
      await appendFixtureButtons(
        page,
        `<ion-button id="legacy-rgb-submit" fill="solid" color="secondary" type="submit">Legacy RGB</ion-button>`,
      );

      await expectBrightnessAppearance(page, page.locator('#legacy-rgb-submit'), LEGACY_RGB.hex);
    });
  }
});
