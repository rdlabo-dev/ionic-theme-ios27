import { expect, test } from '@playwright/test';

for (const direction of ['ltr', 'rtl'] as const) {
  test(`menus respect foldable safe-area insets in ${direction}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/main/index', { waitUntil: 'networkidle' });
    const menu = page.locator('ion-menu');

    const result = await menu.evaluate(async (element: HTMLIonMenuElement, direction) => {
      const app = document.querySelector('ion-app')!;
      app.dir = direction;
      app.classList.add('ios-theme-enable-foldable');
      element.side = direction === 'ltr' ? 'end' : 'start';
      await new Promise(requestAnimationFrame);
      const container = element.shadowRoot!.querySelector<HTMLElement>('[part~="container"]')!;
      await element.open(false);
      const defaultHostBounds = element.getBoundingClientRect();
      const defaultRightOffset = innerWidth - container.getBoundingClientRect().right;
      await element.close(false);
      app.style.setProperty('--ios-theme-foldable-safe-area-left', '76px');
      app.style.setProperty('--ios-theme-foldable-safe-area-right', '84px');
      app.style.setProperty('--ion-safe-area-left', '76px');
      app.style.setProperty('--ion-safe-area-right', '84px');
      const offsets = [];
      for (const side of ['start', 'end'] as const) {
        element.side = side;
        await new Promise(requestAnimationFrame);
        await element.open(false);
        const bounds = element.getBoundingClientRect();
        const containerBounds = container.getBoundingClientRect();
        const physicalSide = side === 'start' ? (direction === 'ltr' ? 'left' : 'right') : direction === 'ltr' ? 'right' : 'left';
        offsets.push({
          side,
          physicalSide,
          hostWidthPreserved: bounds.width > 0 && bounds.width === defaultHostBounds.width,
          offset: physicalSide === 'left' ? containerBounds.left : innerWidth - containerBounds.right,
        });
        await element.close(false);
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
        defaultHostWidthPositive: defaultHostBounds.width > 0,
        defaultRightOffset,
        offsets,
        safeAreaLeft: contentStyle.getPropertyValue('--ion-safe-area-left').trim(),
        safeAreaRight: contentStyle.getPropertyValue('--ion-safe-area-right').trim(),
        modalSafeAreaRight: getComputedStyle(modalContent).getPropertyValue('--ion-safe-area-right').trim(),
      };
    }, direction);

    expect({ hostWidthPositive: result.defaultHostWidthPositive, containerRight: result.defaultRightOffset }).toEqual({
      hostWidthPositive: true,
      containerRight: 80,
    });
    expect(result.offsets).toEqual(
      direction === 'ltr'
        ? [
            { side: 'start', physicalSide: 'left', hostWidthPreserved: true, offset: 76 },
            { side: 'end', physicalSide: 'right', hostWidthPreserved: true, offset: 84 },
          ]
        : [
            { side: 'start', physicalSide: 'right', hostWidthPreserved: true, offset: 84 },
            { side: 'end', physicalSide: 'left', hostWidthPreserved: true, offset: 76 },
          ],
    );
    expect(result.safeAreaLeft).toBe('0px');
    expect(result.safeAreaRight).toBe('0px');
    expect(result.modalSafeAreaRight).toBe('12px');
  });
}
