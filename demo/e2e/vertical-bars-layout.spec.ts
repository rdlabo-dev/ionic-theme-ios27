import { expect, test } from '@playwright/test';

// This suite verifies the iOS 27 layout. Older test WebKit versions otherwise
// load the iOS 26 sheet, whose 1px borders change the full-width modal geometry.
test.beforeEach(async ({ page }) => {
  await page.route('**/styles.css', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, body: (await response.text()).replaceAll('overflow-anchor: auto', 'display: block') });
  });
});

for (const direction of ['ltr', 'rtl'] as const) {
  test(`menus respect verticalBars safe-area insets in ${direction}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/main/index', { waitUntil: 'networkidle' });
    const menu = page.locator('ion-menu');

    const result = await menu.evaluate(async (element: HTMLIonMenuElement, direction) => {
      const app = document.querySelector('ion-app')!;
      app.dir = direction;
      app.classList.add('ios-theme-vertical-bars');
      element.side = direction === 'ltr' ? 'end' : 'start';
      await new Promise(requestAnimationFrame);
      const container = element.shadowRoot!.querySelector<HTMLElement>('[part~="container"]')!;
      await element.open(false);
      const defaultHostBounds = element.getBoundingClientRect();
      const defaultRightOffset = innerWidth - container.getBoundingClientRect().right;
      await element.close(false);
      app.style.setProperty('--ios-theme-vertical-bars-safe-area-left', '76px');
      app.style.setProperty('--ios-theme-vertical-bars-safe-area-right', '84px');
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

for (const { type, edge, direction } of [
  { type: 'normal', edge: 'right', direction: 'ltr' },
  { type: 'card', edge: 'left', direction: 'ltr' },
  { type: 'sheet', edge: 'right', direction: 'rtl' },
]) {
  test(`${type} modal respects ${edge} vertical bars in ${direction}`, async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 900 });
    await page.goto('/main/index/modal', { waitUntil: 'networkidle' });
    await page.locator('ion-app').evaluate(
      (app, { direction, edge }) => {
        app.dir = direction;
        app.classList.add('ios-theme-vertical-bars', `ios-theme-vertical-bars-${edge}`);
        app.style.setProperty(`--ion-safe-area-${edge}`, '80px');
      },
      { direction, edge },
    );
    await page.getByText(`present:${type}`, { exact: true }).click();
    const modal = page.locator('ion-modal:visible');
    await expect(modal).toBeVisible();
    // Ionic 9 updates inline safe areas on resize; keep the author's override explicit.
    await page.addStyleTag({
      content: 'ion-modal { --ion-safe-area-left: 12px !important; --ion-safe-area-right: 18px !important; }',
    });
    for (const tag of ['ion-toolbar', 'ion-content']) {
      const component = modal.locator(tag).first();
      await component.evaluate((element) => {
        element.style.setProperty('--padding-start', '11px');
        element.style.setProperty('--padding-end', '17px');
      });
      await expect
        .poll(() =>
          component.evaluate((element) => {
            const host = getComputedStyle(element);
            const part = getComputedStyle(element.shadowRoot!.querySelector('[part~="scroll"], [part~="container"]')!);
            return {
              left: host.getPropertyValue('--ion-safe-area-left').trim(),
              right: host.getPropertyValue('--ion-safe-area-right').trim(),
              start: part.paddingInlineStart,
              end: part.paddingInlineEnd,
            };
          }),
        )
        .toEqual({
          left: '0px',
          right: '0px',
          start: (edge === (direction === 'ltr' ? 'left' : 'right') ? 91 : 11) + 'px',
          end: (edge === (direction === 'ltr' ? 'right' : 'left') ? 97 : 17) + 'px',
        });
    }
    const close = modal.locator(':scope > .ios-theme-vertical-bars-toolbar-projection[aria-label=Close]');
    const done = modal.locator(':scope > .ios-theme-vertical-bars-toolbar-projection[aria-label=Done]');
    await expect(done).toBeVisible();
    await expect(done).toHaveAttribute('fill', 'solid');
    await expect(done).toHaveAttribute('color', 'primary');
    await expect(close).toBeVisible();
    await expect(page.locator('ion-app > .ios-theme-vertical-bars-back-button-projection')).toHaveCount(0);
    const bounds = await close.boundingBox();
    expect(edge === 'left' ? bounds!.x < 80 : bounds!.x > 620).toBe(true);
    // A centered dialog on the open display keeps its own toolbar and width.
    await page.setViewportSize({ width: 1100, height: 900 });
    await expect(close).toHaveCount(0);
    await expect(done).toHaveCount(0);
    await expect(modal.locator('ion-toolbar').getByRole('button', { name: 'Done', exact: true })).toBeVisible();
    await expect(modal.locator('ion-toolbar').getByRole('button', { name: 'Close', exact: true })).toBeVisible();
    for (const tag of ['ion-toolbar', 'ion-content']) {
      await expect(modal.locator(tag).first()).toHaveCSS('--ion-safe-area-left', '12px');
      await expect(modal.locator(tag).first()).toHaveCSS('--ion-safe-area-right', '18px');
    }
    await expect
      .poll(() =>
        modal
          .locator('ion-content')
          .evaluate((element) => getComputedStyle(element.shadowRoot!.querySelector('[part~="scroll"]')!).paddingInlineEnd),
      )
      .toBe('17px');
    await page.setViewportSize({ width: 700, height: 900 });
    await expect(close).toBeVisible();
    await modal.evaluate((element: HTMLIonModalElement) => {
      element.canDismiss = async () => {
        element.setAttribute('data-dismiss-attempted', '');
        return false;
      };
    });
    await close.click();
    await expect(modal).toHaveAttribute('data-dismiss-attempted', '');
    await expect(modal).toBeVisible();
    await modal.evaluate((element: HTMLIonModalElement) => {
      element.canDismiss = true;
    });
    await done.click();
    await expect(modal).toHaveCount(0);
    await expect(page.locator('ion-app > .ios-theme-vertical-bars-back-button-projection')).toBeVisible();
  });
}

test('stacked modals keep rail controls inside the active dialog and restore the previous surface', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 900 });
  await page.goto('/main/index/modal');
  await page.locator('ion-app').evaluate((app) => app.classList.add('ios-theme-vertical-bars'));
  await page.getByText('present:normal', { exact: true }).click();
  const modals = page.locator('ion-modal:visible');
  const projection = '.ios-theme-vertical-bars-toolbar-projection[aria-label=Close]';
  await expect(modals.first().locator(projection)).toBeVisible();
  await modals.first().getByText('present:normal', { exact: true }).click();
  await expect(modals).toHaveCount(2);
  await expect(modals.first().locator(projection)).toHaveCount(0);
  await expect(modals.last().locator(projection)).toBeVisible();
  await modals.last().getByRole('button', { name: 'Close', exact: true }).focus();
  await expect(modals.last().getByRole('button', { name: 'Close', exact: true })).toBeFocused();
  await modals.last().getByRole('button', { name: 'Close', exact: true }).press('Enter');
  await expect(modals).toHaveCount(1);
  await expect(modals.first().locator(projection)).toBeVisible();
  await modals.first().evaluate((modal) => modal.classList.add('native-ui-disabled'));
  await expect(modals.first().locator(projection)).toHaveCount(0);
  await modals.first().getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modals).toHaveCount(0);
});
