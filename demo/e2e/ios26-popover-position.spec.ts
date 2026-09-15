import { expect, test } from '@playwright/test';

test('popover can be presented without a trigger', async ({ page }) => {
  await page.goto('/main/index/popover');
  await page.waitForSelector('ion-popover.hydrated', { state: 'attached' });
  const result = await page.evaluate(async () => {
    const popover = document.createElement('ion-popover') as any;
    popover.component = document.createElement('div');
    popover.component.textContent = 'Unanchored content';
    document.body.append(popover);
    await popover.present();
    const content = popover.shadowRoot.querySelector('.popover-content') as HTMLElement;
    const origin = getComputedStyle(content).transformOrigin.split(' ').map(parseFloat);
    const visible = popover.presented;
    await popover.dismiss();
    popover.remove();
    return { visible, originX: origin[0], originY: origin[1] };
  });
  expect(result.visible).toBe(true);
  expect(Number.isFinite(result.originX)).toBe(true);
  expect(Number.isFinite(result.originY)).toBe(true);
});

for (const side of ['top', 'bottom', 'left', 'right'] as const) {
  test(`event reference on ion-button keeps click coordinates for ${side} and does not replace`, async ({ page }) => {
    await page.setViewportSize({ width: 1210, height: 834 });
    await page.goto('/main/index/popover');
    await page.waitForSelector('ion-popover.hydrated', { state: 'attached' });
    const result = await page.evaluate(async (placement) => {
      const anchor = document.createElement('ion-button');
      anchor.style.cssText = 'position:fixed;left:500px;top:300px;width:200px;height:120px';
      anchor.textContent = 'Open';
      document.body.append(anchor);
      const popover = document.createElement('ion-popover') as any;
      popover.component = document.createElement('div');
      popover.component.textContent = 'Content';
      popover.style.cssText = '--width:240px;--height:180px';
      popover.reference = 'event';
      popover.event = { target: anchor, clientX: 520, clientY: 320 };
      popover.side = placement;
      document.body.append(popover);
      await popover.present();
      const content = popover.shadowRoot.querySelector('.popover-content') as HTMLElement;
      const rect = content.getBoundingClientRect();
      const origin = getComputedStyle(content).transformOrigin.split(' ').map(parseFloat);
      const result = {
        originX: rect.left + origin[0],
        originY: rect.top + origin[1],
        replacing: anchor.classList.contains('ios-theme-replace-element'),
      };
      await popover.dismiss();
      popover.remove();
      anchor.remove();
      return result;
    }, side);
    expect(result.replacing).toBe(false);
    expect(Number.isFinite(result.originX)).toBe(true);
    expect(Number.isFinite(result.originY)).toBe(true);
    expect(Math.abs(result.originX - 520.5)).toBeLessThan(1);
    expect(Math.abs(result.originY - 320.5)).toBeLessThan(1);
  });
}

for (const width of [390, 1210]) {
  test(`popover stays in its content pane at viewport width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 834 });
    await page.goto('/main/index/popover');
    await page.waitForSelector('ion-popover.hydrated', { state: 'attached' });
    for (const edge of ['left', 'right'] as const) {
      const result = await page.evaluate(async (side) => {
        const pane = document.querySelector('app-popover ion-content') ?? document.querySelector('ion-router-outlet ion-content');
        if (!pane) throw new Error('Content pane missing');
        const anchor = document.createElement('ion-button');
        anchor.textContent = 'Open';
        const scroll = pane.shadowRoot?.querySelector('[part="scroll"]');
        const inset = scroll ? getComputedStyle(scroll)[side === 'left' ? 'paddingLeft' : 'paddingRight'] : '0px';
        anchor.style.cssText = `position:absolute;top:120px;${side}:${inset};width:60px`;
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
        const content = popover.shadowRoot.querySelector('[part="content"]') as HTMLElement;
        const rect = content.getBoundingClientRect();
        const origin = parseFloat(getComputedStyle(content).transformOrigin);
        const result = {
          left: rect.left,
          right: rect.right,
          paneLeft: paneRect.left,
          paneRight: paneRect.right,
          origin: rect.left + origin,
          originParts: getComputedStyle(content).transformOrigin.split(' ').map(parseFloat),
          anchorCenter: anchorRect.left + anchorRect.width / 2,
        };
        await popover.dismiss();
        popover.remove();
        anchor.remove();
        return result;
      }, edge);
      expect(result.left).toBeGreaterThanOrEqual(result.paneLeft + 7.5);
      expect(result.right).toBeLessThanOrEqual(result.paneRight - 7.5);
      expect(Number.isFinite(result.originParts[0])).toBe(true);
      expect(Number.isFinite(result.originParts[1])).toBe(true);
      expect(Math.abs(result.origin - result.anchorCenter)).toBeLessThan(1);
    }
  });
}

test('temporary maxWidth is restored after dismiss and reopen', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 834 });
  await page.goto('/main/index/popover');
  await page.waitForSelector('ion-popover.hydrated', { state: 'attached' });
  const result = await page.evaluate(async () => {
    const pane = document.querySelector('app-popover ion-content') ?? document.querySelector('ion-router-outlet ion-content');
    if (!pane) throw new Error('Content pane missing');
    const anchor = document.createElement('button');
    anchor.style.cssText = 'position:absolute;top:120px;left:8px;width:40px;height:40px';
    pane.append(anchor);
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    const popover = document.createElement('ion-popover') as any;
    popover.component = document.createElement('div');
    popover.component.textContent = 'Wide content that must shrink to the pane';
    popover.event = { target: anchor };
    popover.style.cssText = '--width:520px';
    document.body.append(popover);

    await popover.present();
    const content = popover.shadowRoot.querySelector('.popover-content') as HTMLElement;
    const whileOpen = {
      maxWidth: content.style.maxWidth,
      previous: content.dataset['previousMaxWidth'],
    };

    await popover.dismiss();
    const afterDismiss = {
      maxWidth: content.style.maxWidth,
      previous: content.dataset['previousMaxWidth'],
      width: popover.style.getPropertyValue('--width'),
    };

    document.body.append(popover);
    await popover.present();
    const reopenedContent = popover.shadowRoot.querySelector('.popover-content') as HTMLElement;
    const onReopen = {
      maxWidth: reopenedContent.style.maxWidth,
      previous: reopenedContent.dataset['previousMaxWidth'],
    };
    await popover.dismiss();
    popover.remove();
    anchor.remove();
    return { whileOpen, afterDismiss, onReopen };
  });

  expect(result.whileOpen.maxWidth).toMatch(/px$/);
  expect(result.whileOpen.previous).toBeDefined();
  expect(result.afterDismiss.maxWidth).toBe(result.whileOpen.previous);
  expect(result.afterDismiss.previous).toBeUndefined();
  expect(result.afterDismiss.width).toBe('520px');
  expect(result.onReopen.maxWidth).toMatch(/px$/);
  expect(result.onReopen.previous).toBeDefined();
});
