import { expect, test } from '@playwright/test';

for (const direction of ['ltr', 'rtl'] as const) {
  test(`menus consume bilateral physical safe areas in ${direction}`, async ({ page }) => {
    await page.goto('/main/index', { waitUntil: 'networkidle' });
    const menu = page.locator('ion-menu');

    const result = await menu.evaluate(async (element: HTMLIonMenuElement, direction) => {
      const app = document.querySelector('ion-app')!;
      app.dir = direction;
      app.classList.add('ionic-theme-enable-safe-area');
      app.style.setProperty('--ion-theme-safe-area-left', '76px');
      app.style.setProperty('--ion-theme-safe-area-right', '84px');
      app.style.setProperty('--ion-safe-area-left', '76px');
      app.style.setProperty('--ion-safe-area-right', '84px');
      const offsets = [];
      for (const side of ['start', 'end'] as const) {
        element.side = side;
        await new Promise(requestAnimationFrame);
        const bounds = element.getBoundingClientRect();
        const physicalSide = side === 'start' ? (direction === 'ltr' ? 'left' : 'right') : direction === 'ltr' ? 'right' : 'left';
        offsets.push({ side, physicalSide, offset: physicalSide === 'left' ? bounds.left : innerWidth - bounds.right });
      }
      const contentStyle = getComputedStyle(element.querySelector('ion-content')!);

      const modal = document.createElement('ion-modal');
      modal.mode = 'ios';
      modal.style.setProperty('--ion-safe-area-right', '12px');
      const modalContent = document.createElement('ion-content');
      modalContent.mode = 'ios';
      modal.append(modalContent);
      app.append(modal);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      if (!modalContent.classList.contains('ios')) throw new Error('Expected an iOS ion-content fixture');
      return {
        offsets,
        safeAreaLeft: contentStyle.getPropertyValue('--ion-safe-area-left').trim(),
        safeAreaRight: contentStyle.getPropertyValue('--ion-safe-area-right').trim(),
        modalSafeAreaRight: getComputedStyle(modalContent).getPropertyValue('--ion-safe-area-right').trim(),
      };
    }, direction);

    expect(result.offsets).toEqual(
      direction === 'ltr'
        ? [
            { side: 'start', physicalSide: 'left', offset: 76 },
            { side: 'end', physicalSide: 'right', offset: 84 },
          ]
        : [
            { side: 'start', physicalSide: 'right', offset: 84 },
            { side: 'end', physicalSide: 'left', offset: 76 },
          ],
    );
    expect(result.safeAreaLeft).toBe('0px');
    expect(result.safeAreaRight).toBe('0px');
    expect(result.modalSafeAreaRight).toBe('12px');
  });
}
