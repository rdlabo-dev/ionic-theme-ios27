import { expect, test } from '@playwright/test';

for (const direction of ['ltr', 'rtl'] as const) {
  test(`start menu consumes the ${direction === 'ltr' ? 'left' : 'right'} physical safe area in ${direction}`, async ({ page }) => {
    await page.goto('/main/index', { waitUntil: 'networkidle' });
    const menu = page.locator('ion-menu');

    const result = await menu.evaluate((element: HTMLIonMenuElement, direction) => {
      const app = document.querySelector('ion-app')!;
      app.dir = direction;
      app.classList.add('ionic-theme-enable-safe-area');
      app.style.setProperty('--ion-theme-safe-area-left', '76px');
      app.style.setProperty('--ion-theme-safe-area-right', '84px');
      app.style.setProperty('--ion-safe-area-left', '76px');
      app.style.setProperty('--ion-safe-area-right', '84px');
      element.side = 'start';

      const bounds = element.getBoundingClientRect();
      const contentStyle = getComputedStyle(element.querySelector('ion-content')!);
      return {
        left: bounds.left,
        right: innerWidth - bounds.right,
        safeAreaLeft: contentStyle.getPropertyValue('--ion-safe-area-left').trim(),
        safeAreaRight: contentStyle.getPropertyValue('--ion-safe-area-right').trim(),
      };
    }, direction);

    expect(direction === 'ltr' ? result.left : result.right).toBe(direction === 'ltr' ? 76 : 84);
    expect(result.safeAreaLeft).toBe('0px');
    expect(result.safeAreaRight).toBe('0px');
  });
}
