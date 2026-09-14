import { expect, test } from '@playwright/test';

test('ordinary anchors show an arrow and morphing buttons do not', async ({ page }) => {
  await page.goto('/main/index/popover');
  for (const trigger of ['click-trigger-button', 'click-trigger-right', 'click-trigger-button']) {
    await page.locator(`#${trigger}`).click();
    const popover = page.locator(`ion-popover[trigger="${trigger}"]`);
    await expect(popover).toBeVisible();
    const arrow = popover.locator('[part="arrow"]');
    if (trigger === 'click-trigger-right') {
      await expect(arrow).toBeHidden();
    } else {
      await expect(arrow).toBeVisible();
    }
    await popover.evaluate(async (el: any) => el.dismiss());
    await expect(popover).toBeHidden();
  }
});

test('popover can be presented without a trigger', async ({ page }) => {
  await page.goto('/main/index/popover');
  await page.waitForSelector('ion-popover.hydrated', { state: 'attached' });
  const result = await page.evaluate(async () => {
    const popover = document.createElement('ion-popover') as any;
    popover.component = document.createElement('div');
    popover.component.textContent = 'Unanchored content';
    document.body.append(popover);
    await popover.present();
    const visible = popover.presented;
    await popover.dismiss();
    popover.remove();
    return visible;
  });
  expect(result).toBe(true);
});

for (const side of ['top', 'bottom', 'left', 'right']) {
  test(`arrow stays visible for ${side} placement`, async ({ page }) => {
    await page.setViewportSize({ width: 1210, height: 834 });
    await page.goto('/main/index/popover');
    await page.waitForSelector('ion-popover.hydrated', { state: 'attached' });
    const bounds = await page.evaluate(async (side) => {
      const anchor = document.createElement('button');
      anchor.style.cssText = 'position:fixed;left:540px;top:350px;width:80px;height:44px';
      document.body.append(anchor);
      const popover = document.createElement('ion-popover') as any;
      popover.component = document.createElement('div');
      popover.component.textContent = 'Content';
      popover.style.cssText = '--width:240px;--height:180px';
      popover.event = { target: anchor };
      popover.side = side;
      document.body.append(popover);
      await popover.present();
      const arrow = popover.shadowRoot.querySelector('[part="arrow"]');
      const rect = arrow.getBoundingClientRect();
      const result = { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      await popover.dismiss();
      popover.remove();
      anchor.remove();
      return result;
    }, side);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(1210);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(834);
  });
}

for (const width of [390, 1210]) {
  test(`popover stays in its content pane at viewport width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 834 });
    await page.goto('/main/index/popover');
    await page.waitForSelector('ion-popover.hydrated', { state: 'attached' });
    for (const edge of ['left', 'right']) {
      const result = await page.evaluate(async (edge) => {
        const pane = document.querySelector('app-popover ion-content') ?? document.querySelector('ion-router-outlet ion-content');
        if (!pane) throw new Error('Content pane missing');
        const anchor = document.createElement('ion-button');
        anchor.textContent = 'Open';
        const scroll = pane.shadowRoot?.querySelector('[part="scroll"]');
        const inset = scroll ? getComputedStyle(scroll)[edge === 'left' ? 'paddingLeft' : 'paddingRight'] : '0px';
        anchor.style.cssText = `position:absolute;top:120px;${edge}:${inset};width:60px`;
        pane.append(anchor);
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        const anchorRect = anchor.getBoundingClientRect();
        const paneRect = pane.getBoundingClientRect();
        const popover = document.createElement('ion-popover') as any;
        popover.component = document.createElement('div');
        popover.component.textContent = 'Content';
        popover.event = { target: anchor };
        popover.style.cssText = '--width:240px';
        document.body.append(popover);
        await popover.present();
        const content = popover.shadowRoot.querySelector('[part="content"]');
        const rect = content.getBoundingClientRect();
        const origin = parseFloat(getComputedStyle(content).transformOrigin);
        const result = {
          left: rect.left,
          right: rect.right,
          paneLeft: paneRect.left,
          paneRight: paneRect.right,
          origin: rect.left + origin,
          anchorCenter: anchorRect.left + anchorRect.width / 2,
        };
        await popover.dismiss();
        popover.remove();
        anchor.remove();
        return result;
      }, edge);
      expect(result.left).toBeGreaterThanOrEqual(result.paneLeft + 7.5);
      expect(result.right).toBeLessThanOrEqual(result.paneRight - 7.5);
      expect(Math.abs(result.origin - result.anchorCenter)).toBeLessThan(1);
    }
  });
}

for (const width of [390, 1210]) {
  test(`real demo triggers keep the surface and arrow aligned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 834 });
    await page.goto('/main/index/popover');
    for (const id of [
      'click-trigger-left',
      'click-trigger-left-buttons',
      'click-trigger-button',
      'click-trigger-item-left',
      'click-trigger-button-right',
    ]) {
      const trigger = page.locator(`#${id}`);
      await trigger.scrollIntoViewIfNeeded();
      const before = await trigger.boundingBox();
      await trigger.click();
      const popover = page.locator(`ion-popover[trigger="${id}"]`);
      await expect(popover).toBeVisible();
      await expect
        .poll(() =>
          popover.evaluate((el: any) =>
            el.shadowRoot
              .querySelector('[part="content"]')
              .getAnimations()
              .every((a: Animation) => a.playState === 'finished'),
          ),
        )
        .toBe(true);
      const geometry = await popover.evaluate((el: any) => {
        const trigger = document.getElementById(el.trigger)!;
        const pane = trigger.closest('ion-content')!;
        const scroll = pane.shadowRoot!.querySelector('[part="scroll"]')!;
        const style = getComputedStyle(scroll);
        const paneRect = pane.getBoundingClientRect();
        const content = el.shadowRoot.querySelector('[part="content"]');
        const rect = content.getBoundingClientRect();
        const arrow = el.shadowRoot.querySelector('[part="arrow"]');
        const arrowRect = arrow.getBoundingClientRect();
        const anchor = trigger.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          min: paneRect.left + parseFloat(style.paddingLeft),
          max: paneRect.right - parseFloat(style.paddingRight),
          arrowVisible: getComputedStyle(arrow).display !== 'none',
          arrowCenter: arrowRect.left + arrowRect.width / 2,
          arrowTop: arrowRect.top,
          arrowBottom: arrowRect.bottom,
          anchorCenter: anchor.left + anchor.width / 2,
        };
      });
      expect(geometry.left).toBeGreaterThanOrEqual(geometry.min + 7.5);
      expect(geometry.right).toBeLessThanOrEqual(geometry.max - 7.5);
      if (['click-trigger-left', 'click-trigger-left-buttons'].includes(id)) {
        expect(Math.abs(geometry.left - before!.x)).toBeLessThan(1);
      }
      if (id === 'click-trigger-right') {
        expect(Math.abs(geometry.right - before!.x - before!.width)).toBeLessThan(1);
      }
      if (geometry.arrowVisible) {
        expect(Math.abs(geometry.arrowCenter - geometry.anchorCenter)).toBeLessThanOrEqual(1);
        expect(Math.min(Math.abs(geometry.arrowBottom - geometry.top), Math.abs(geometry.arrowTop - geometry.bottom))).toBeLessThanOrEqual(
          1.5,
        );
      }
      await popover.evaluate(async (el: any) => el.dismiss());
      await expect(popover).toBeHidden();
    }
  });
}
