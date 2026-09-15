import { expect, test, type Locator, type Page } from '@playwright/test';

test.use({ viewport: { width: 402, height: 874 } });

const appearances = ['light', 'dark'] as const;
const optOutClasses = ['ios-theme-disabled', 'ios26-disabled'] as const;

const setPaletteDark = async (page: Page, dark: boolean) => {
  await page.evaluate((enabled) => {
    document.documentElement.classList.toggle('ion-palette-dark', enabled);
  }, dark);
};

const appendFixtures = async (page: Page, markup: string) => {
  await page.evaluate((html) => {
    document.querySelector('#ios26-child-optout-fixture')?.remove();
    const app = document.querySelector('ion-app');
    if (!app) {
      throw new Error('ion-app not found');
    }
    const wrap = document.createElement('div');
    wrap.id = 'ios26-child-optout-fixture';
    wrap.style.cssText =
      'position:fixed;top:88px;left:12px;right:12px;z-index:10000;max-height:70vh;overflow:auto;padding:12px;background:rgba(255,255,255,0.96);';
    wrap.innerHTML = html;
    app.appendChild(wrap);
  }, markup);
};

const waitHydrated = async (root: Locator) => {
  await expect(root).toBeVisible();
  await root.evaluate(async (el) => {
    const nodes = [el, ...Array.from(el.querySelectorAll('*'))] as Array<HTMLElement & { componentOnReady?: () => Promise<unknown> }>;
    await Promise.all(nodes.map((node) => node.componentOnReady?.() ?? Promise.resolve()));
  });
  await expect.poll(async () => root.evaluate((el) => el.classList.contains('hydrated') || el.childElementCount > 0)).toBe(true);
  await root.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
};

const itemNativePaddingStart = async (item: Locator) =>
  item.evaluate((el) => {
    const host = el as HTMLElement;
    const native =
      host.shadowRoot?.querySelector('[part~="native"]') ??
      host.shadowRoot?.querySelector('.item-native') ??
      host.shadowRoot?.querySelector('a, button, div');
    if (!native) {
      throw new Error('ion-item native surface not found in shadow tree');
    }
    const style = getComputedStyle(native);
    return {
      cssVar: getComputedStyle(host).getPropertyValue('--padding-start').trim(),
      paddingInlineStart: style.paddingInlineStart,
      tag: native.localName,
      part: native.getAttribute('part'),
    };
  });

const itemContainerFlex = async (item: Locator) =>
  item.evaluate((el) => {
    const host = el as HTMLElement;
    const container =
      host.shadowRoot?.querySelector('[part~="container"]') ?? host.shadowRoot?.querySelector('.item-inner, .input-wrapper');
    if (!container) {
      throw new Error('ion-item container surface not found in shadow tree');
    }
    const style = getComputedStyle(container);
    return {
      flexDirection: style.flexDirection,
      minHeight: style.minHeight,
      tag: container.localName,
      part: container.getAttribute('part'),
    };
  });

test.describe('iOS26 child theme opt-outs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/main/index/card', { waitUntil: 'networkidle' });
    await expect(page.locator('app-card ion-card').first()).toHaveClass(/hydrated/);
  });

  for (const appearance of appearances) {
    for (const optOut of optOutClasses) {
      test(`card nested item ${optOut} keeps Ionic padding; sibling stays themed (${appearance})`, async ({ page }) => {
        await setPaletteDark(page, appearance === 'dark');
        await appendFixtures(
          page,
          `<ion-card id="optout-card" mode="ios">
            <ion-card-content>
              <ion-list id="optout-card-list" mode="ios">
                <ion-item id="card-item-themed" mode="ios" lines="none"><ion-label>Themed</ion-label></ion-item>
                <ion-item id="card-item-optout" class="${optOut}" mode="ios" lines="none"><ion-label>Opt out</ion-label></ion-item>
              </ion-list>
            </ion-card-content>
          </ion-card>
          <ion-item id="card-item-baseline" mode="ios" lines="none"><ion-label>Baseline</ion-label></ion-item>`,
        );

        const card = page.locator('#optout-card');
        const themed = page.locator('#card-item-themed');
        const opted = page.locator('#card-item-optout');
        const baseline = page.locator('#card-item-baseline');
        await waitHydrated(card);
        await waitHydrated(baseline);

        await expect(card).toHaveCSS('border-radius', '24px');

        const themedPad = await itemNativePaddingStart(themed);
        const optedPad = await itemNativePaddingStart(opted);
        const baselinePad = await itemNativePaddingStart(baseline);

        expect(themedPad.cssVar === '0' || themedPad.cssVar === '0px').toBe(true);
        expect(themedPad.paddingInlineStart).toBe('0px');
        expect(optedPad).toEqual(baselinePad);
        expect(optedPad.paddingInlineStart).not.toBe('0px');
        expect(await page.locator('#optout-card-list').evaluate((el) => el.className)).not.toMatch(/ios-theme-disabled|ios26-disabled/);
      });

      test(`card nested list ${optOut} skips padding override; sibling list stays themed (${appearance})`, async ({ page }) => {
        await setPaletteDark(page, appearance === 'dark');
        await appendFixtures(
          page,
          `<ion-card id="optout-card-list-host" mode="ios">
            <ion-card-content>
              <ion-list id="card-list-themed" mode="ios">
                <ion-item id="card-list-themed-item" mode="ios" lines="none"><ion-label>Themed list</ion-label></ion-item>
              </ion-list>
              <ion-list id="card-list-optout" class="${optOut}" mode="ios">
                <ion-item id="card-list-optout-item" mode="ios" lines="none"><ion-label>Opt-out list</ion-label></ion-item>
              </ion-list>
            </ion-card-content>
          </ion-card>`,
        );

        const card = page.locator('#optout-card-list-host');
        await waitHydrated(card);
        await expect(card).toHaveCSS('border-radius', '24px');

        const themedPad = await itemNativePaddingStart(page.locator('#card-list-themed-item'));
        const optedPad = await itemNativePaddingStart(page.locator('#card-list-optout-item'));
        expect(themedPad.paddingInlineStart).toBe('0px');
        expect(optedPad.paddingInlineStart).not.toBe('0px');
      });
    }
  }

  for (const appearance of appearances) {
    for (const optOut of optOutClasses) {
      test(`inset list item ${optOut} skips stacked label/note layout; sibling stays themed (${appearance})`, async ({ page }) => {
        await page.goto('/main/index/item-list', { waitUntil: 'networkidle' });
        await expect(page.locator('app-item-list ion-list.list-inset').first()).toBeVisible();
        await setPaletteDark(page, appearance === 'dark');
        await appendFixtures(
          page,
          `<ion-list id="optout-inset" class="list-inset" mode="ios">
            <ion-list-header id="optout-header-themed"><ion-label>Themed header</ion-label></ion-list-header>
            <ion-list-header id="optout-header-optout" class="${optOut}"><ion-label>Opt-out header</ion-label></ion-list-header>
            <ion-item-group id="optout-group">
              <ion-item id="list-item-themed" mode="ios" lines="none">
                <ion-label>Themed</ion-label>
                <ion-note>Note</ion-note>
              </ion-item>
              <ion-item id="list-item-optout" class="${optOut}" mode="ios" lines="none">
                <ion-label>Opt out</ion-label>
                <ion-note>Note</ion-note>
              </ion-item>
            </ion-item-group>
            <ion-note id="list-note-themed">Themed footer note</ion-note>
            <ion-note id="list-note-optout" class="${optOut}">Opt-out footer note</ion-note>
          </ion-list>
          <ion-list id="list-baseline" mode="ios">
            <ion-item id="list-item-baseline" mode="ios" lines="none">
              <ion-label>Baseline</ion-label>
              <ion-note>Note</ion-note>
            </ion-item>
            <ion-note id="list-note-baseline">Baseline footer note</ion-note>
          </ion-list>`,
        );

        const list = page.locator('#optout-inset');
        await waitHydrated(list);

        const groupRadius = await page.locator('#optout-group').evaluate((el) => getComputedStyle(el).borderRadius);
        expect(groupRadius).toBe('28px');

        const themedHeaderLabel = page.locator('#optout-header-themed ion-label');
        const optedHeaderLabel = page.locator('#optout-header-optout ion-label');
        await expect(themedHeaderLabel).toHaveCSS('font-size', '14.4px');
        const optedHeaderSize = await optedHeaderLabel.evaluate((el) => getComputedStyle(el).fontSize);
        expect(optedHeaderSize).not.toBe('14.4px');

        const themedContainer = await itemContainerFlex(page.locator('#list-item-themed'));
        const optedContainer = await itemContainerFlex(page.locator('#list-item-optout'));
        const baselineContainer = await itemContainerFlex(page.locator('#list-item-baseline'));
        expect(themedContainer.flexDirection).toBe('column');
        expect(optedContainer.flexDirection).toBe(baselineContainer.flexDirection);
        expect(optedContainer.flexDirection).not.toBe('column');

        const themedLabelSize = await page.locator('#list-item-themed > ion-label').evaluate((el) => getComputedStyle(el).fontSize);
        const optedLabelSize = await page.locator('#list-item-optout > ion-label').evaluate((el) => getComputedStyle(el).fontSize);
        expect(themedLabelSize).toBe('18.4px'); // 1.15rem
        expect(optedLabelSize).not.toBe(themedLabelSize);

        const themedNote = await page.locator('#list-note-themed').evaluate((el) => ({
          fontSize: getComputedStyle(el).fontSize,
          display: getComputedStyle(el).display,
          colorVar: getComputedStyle(el).getPropertyValue('--color').trim(),
        }));
        const optedNote = await page.locator('#list-note-optout').evaluate((el) => ({
          fontSize: getComputedStyle(el).fontSize,
          display: getComputedStyle(el).display,
          colorVar: getComputedStyle(el).getPropertyValue('--color').trim(),
        }));
        const baselineNote = await page.locator('#list-note-baseline').evaluate((el) => ({
          fontSize: getComputedStyle(el).fontSize,
          display: getComputedStyle(el).display,
          colorVar: getComputedStyle(el).getPropertyValue('--color').trim(),
        }));
        expect(themedNote.fontSize).toBe('14.4px');
        expect(themedNote.display).toBe('block');
        expect(optedNote).toEqual(baselineNote);
        expect(optedNote.fontSize).not.toBe(themedNote.fontSize);
      });
    }
  }
});
