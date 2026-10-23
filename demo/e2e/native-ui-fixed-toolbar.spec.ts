import { expect, test } from '@playwright/test';
import { compile } from 'sass';
import { resolve } from 'node:path';

const css = compile(resolve(__dirname, '../../packages/theme-ios27/src/styles/vertical-bars.scss')).css;

for (const tag of ['ion-header', 'ion-footer']) {
  for (const fade of [false, true]) {
    test(`${tag} fade=${fade}: prehide and safe-area spacing follow fixed versus scrolling placement`, async ({ page }) => {
      const surface = (id: string) =>
        `<${tag} ${fade ? 'collapse="fade"' : ''}><ion-toolbar id="${id}" class="ios"><ion-back-button></ion-back-button></ion-toolbar></${tag}>`;
      await page.setContent(
        `<html class="native-ui-prehide"><body><ion-app class="ios-theme-vertical-bars" style="--ios-theme-vertical-bars-native-inset: 84px"><div class="ion-page">${surface('fixed')}<ion-content>${surface('scrolling')}</ion-content></div></ion-app></body></html>`,
      );
      await page.addStyleTag({ content: css });
      await page.evaluate(() => {
        for (const toolbar of document.querySelectorAll('ion-toolbar')) {
          toolbar.attachShadow({ mode: 'open' }).innerHTML = '<div part="container"><slot></slot></div>';
        }
      });
      await expect(page.locator('#fixed ion-back-button')).toHaveCSS('visibility', 'hidden');
      await expect(page.locator('#scrolling ion-back-button')).toHaveCSS('visibility', 'visible');
      await expect(page.locator('#fixed [part="container"]')).toHaveCSS('padding-right', '84px');
      await expect(page.locator('#scrolling [part="container"]')).toHaveCSS('padding-right', '0px');
    });
  }
}

for (const marker of ['collapse="condense"', 'class="header-collapse-condense"']) {
  test(`condense ${marker} is never hidden by the entering-back CSS`, async ({ page }) => {
    await page.setContent(
      `<html class="native-ui-prehide"><body><ion-app class="ios-theme-vertical-bars"><ion-header ${marker}><ion-toolbar><ion-back-button></ion-back-button></ion-toolbar></ion-header></ion-app></body></html>`,
    );
    await page.addStyleTag({ content: css });
    await expect(page.locator('ion-back-button')).toHaveCSS('visibility', 'visible');
  });
}
