import { expect, test } from '@playwright/test';

// Compare opted-out children with an unthemed sibling, not Ionic's current px values.
// Structural selectors are identical in light/dark, so do not multiply that axis.
for (const optOut of ['ios-theme-disabled', 'ios26-disabled']) {
  test(`${optOut} isolates card item/list padding from themed siblings`, async ({ page }) => {
    await page.goto('/main/index/card');
    await expect(page.locator('app-card ion-card').first()).toHaveClass(/hydrated/);
    await page.evaluate((cls) => {
      document.querySelector('ion-app')!.insertAdjacentHTML(
        'beforeend',
        `
        <div id="optout-fixture">
          <ion-card><ion-card-content>
            <ion-list>
              <ion-item id="themed"><ion-label>Themed</ion-label></ion-item>
              <ion-item id="opted-item" class="${cls}"><ion-label>Opted out</ion-label></ion-item>
            </ion-list>
            <ion-list class="${cls}"><ion-item id="opted-list-item"><ion-label>Opted out list</ion-label></ion-item></ion-list>
          </ion-card-content></ion-card>
          <ion-item id="baseline"><ion-label>Baseline</ion-label></ion-item>
        </div>`,
      );
    }, optOut);
    await expect(page.locator('#optout-fixture ion-item:not(.hydrated)')).toHaveCount(0);
    const padding = (id: string) => page.locator(`#${id} [part="native"]`).evaluate((el) => getComputedStyle(el).paddingInlineStart);
    const baseline = await padding('baseline');
    expect(await padding('themed')).not.toBe(baseline);
    expect(await padding('opted-item')).toBe(baseline);
    expect(await padding('opted-list-item')).toBe(baseline);
  });

  test(`${optOut} isolates stacked list layout and typography from themed siblings`, async ({ page }) => {
    await page.goto('/main/index/item-list');
    await expect(page.locator('app-item-list ion-list').first()).toHaveClass(/hydrated/);
    await page.evaluate((cls) => {
      document.querySelector('ion-app')!.insertAdjacentHTML(
        'beforeend',
        `
        <div id="optout-fixture">
          <ion-list inset="true">
            <ion-list-header><ion-label id="themed-header">Themed</ion-label></ion-list-header>
            <ion-list-header class="${cls}"><ion-label id="opted-header">Opted out</ion-label></ion-list-header>
            <ion-item-group>
              <ion-item id="themed"><ion-label>Label</ion-label><ion-note>Note</ion-note></ion-item>
              <ion-item id="opted" class="${cls}"><ion-label>Label</ion-label><ion-note>Note</ion-note></ion-item>
            </ion-item-group>
            <ion-note id="themed-note">Themed</ion-note><ion-note id="opted-note" class="${cls}">Opted out</ion-note>
          </ion-list>
          <ion-list class="${cls}">
            <ion-list-header><ion-label id="baseline-header">Baseline</ion-label></ion-list-header>
            <ion-item id="baseline"><ion-label>Label</ion-label><ion-note>Note</ion-note></ion-item>
            <ion-note id="baseline-note">Baseline</ion-note>
          </ion-list>
        </div>`,
      );
    }, optOut);
    await expect(page.locator('#optout-fixture :is(ion-item,ion-label,ion-note):not(.hydrated)')).toHaveCount(0);
    const styles = (id: string) =>
      page.locator(`#${id}`).evaluate((el) => {
        const style = getComputedStyle(el);
        return { fontSize: style.fontSize, display: style.display };
      });
    const direction = (id: string) => page.locator(`#${id} [part="container"]`).evaluate((el) => getComputedStyle(el).flexDirection);
    expect(await direction('themed')).toBe('column');
    expect(await direction('opted')).toBe(await direction('baseline'));
    expect(await direction('opted')).not.toBe('column');
    for (const suffix of ['header', 'note']) {
      expect(await styles(`opted-${suffix}`)).toEqual(await styles(`baseline-${suffix}`));
      expect(await styles(`themed-${suffix}`)).not.toEqual(await styles(`baseline-${suffix}`));
    }
  });
}
