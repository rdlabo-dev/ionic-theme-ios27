import { expect, test } from '@playwright/test';

for (const dark of [false, true]) {
  test(`glass button pressed shading: dark=${dark}`, async ({ page }) => {
    await page.goto('/main/index/button');
    await expect(page.locator('ion-tab-bar')).toBeVisible();
    await page.evaluate((dark) => {
      document.documentElement.classList.toggle('ion-palette-dark', dark);
      const fixture = document.createElement('div');
      fixture.id = 'glass-button-probe';
      fixture.innerHTML = `
        <ion-buttons class="ios"><ion-button mode="ios" fill="clear">Grouped</ion-button></ion-buttons>
        <ion-button mode="ios" fill="default">Standalone</ion-button>`;
      document.body.append(fixture);
    }, dark);
    const buttons = page.locator('#glass-button-probe ion-button');
    await expect(buttons.locator('[part="native"]')).toHaveCount(2);
    const read = () =>
      page.locator('#glass-button-probe').evaluate((fixture) =>
        [
          fixture.querySelector('ion-buttons')!,
          fixture.querySelector(':scope > ion-button')!.shadowRoot!.querySelector('[part="native"]')!,
        ].map((el) => {
          const style = getComputedStyle(el);
          return { background: style.backgroundColor, shadow: style.boxShadow };
        }),
      );
    const rest = await read();
    await buttons.evaluateAll((elements) => elements.forEach((el) => el.classList.add('ion-activated')));
    const pressed = await read();
    if (dark) {
      for (const surface of pressed) {
        expect(surface.background).toBe('rgba(255, 255, 255, 0.5)');
        expect(surface.shadow).toContain('rgba(0, 0, 0, 0.32)');
        expect(surface.shadow).toContain('inset');
      }
    } else {
      for (const surface of pressed) expect(surface.background).toBe('rgba(255, 255, 255, 0.96)');
    }
    await buttons.evaluateAll((elements) => elements.forEach((el) => el.classList.remove('ion-activated')));
    expect(await read()).toEqual(rest);
  });
}

for (const color of [undefined, 'primary', 'danger', 'brand']) {
  test(`submit preserves ${color ?? 'default'} color and contrast when pressed`, async ({ page }) => {
    await page.goto('/main/index/button');
    await page.addStyleTag({ content: '.ion-color-brand { --ion-color-base: #ffee00; --ion-color-contrast: #112233; }' });
    await page.evaluate((color) => {
      const button = document.createElement('ion-button');
      button.id = 'submit-probe';
      button.mode = 'ios';
      button.setAttribute('type', 'submit');
      button.color = color;
      button.textContent = 'Submit';
      button.style.cssText = 'position:fixed;top:100px;left:20px;z-index:99999';
      document.body.append(button);
    }, color);
    const button = page.locator('#submit-probe');
    await expect(button).toHaveClass(/hydrated/);
    const expected = await button.evaluate((element, color) => {
      const style = getComputedStyle(element);
      const background = style.getPropertyValue(color ? '--ion-color-base' : '--ion-color-primary').trim();
      const contrast = style.getPropertyValue(color ? '--ion-color-contrast' : '--ion-color-primary-contrast').trim();
      const probe = document.createElement('span');
      probe.style.color = contrast;
      document.body.append(probe);
      const foreground = getComputedStyle(probe).color;
      probe.remove();
      return { background, foreground };
    }, color);
    const native = button.locator('button');
    await expect(native).toHaveCSS('color', expected.foreground);
    await button.evaluate((element) => element.classList.add('ion-activated'));
    await expect
      .poll(() => button.evaluate((element) => getComputedStyle(element).getPropertyValue('--background-activated').trim()))
      .toBe(expected.background);
    await expect(native).toHaveCSS('color', expected.foreground);
  });
}
