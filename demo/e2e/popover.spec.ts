import { expect, test } from '@playwright/test';

/** Element the spec instruments to capture the bounds the animation measured. */
interface MeasuredTrigger extends HTMLElement {
  presentationBounds?: DOMRect;
  restoreMeasurement?: () => void;
}

/** `presented` exists on the component class but not its public element interface. */
type PopoverProbe = HTMLIonPopoverElement & { presented: boolean };

test('ordinary anchors show an arrow and morphing buttons do not', async ({ page }) => {
  await page.goto('/main/index/popover');
  // Reopen the ordinary trigger to verify callout cleanup after a morphing popover.
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
    await popover.evaluate(async (el: HTMLIonPopoverElement) => el.dismiss());
    await expect(popover).toBeHidden();
  }
});

test('popover can be presented without a trigger', async ({ page }) => {
  await page.goto('/main/index/popover');
  await page.waitForSelector('ion-popover.hydrated', { state: 'attached' });
  const result = await page.evaluate(async () => {
    const popover = document.createElement('ion-popover') as PopoverProbe;
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

for (const side of ['top', 'bottom', 'left', 'right'] as const) {
  test(`arrow stays visible for ${side} placement`, async ({ page }) => {
    await page.setViewportSize({ width: 1210, height: 834 });
    await page.goto('/main/index/popover');
    await page.waitForSelector('ion-popover.hydrated', { state: 'attached' });
    const bounds = await page.evaluate(async (side) => {
      const anchor = document.createElement('button');
      anchor.style.cssText = 'position:fixed;left:540px;top:350px;width:80px;height:44px';
      document.body.append(anchor);
      const popover = document.createElement('ion-popover') as PopoverProbe;
      popover.component = document.createElement('div');
      popover.component.textContent = 'Content';
      popover.style.cssText = '--width:240px;--height:180px';
      popover.event = { target: anchor };
      popover.side = side;
      document.body.append(popover);
      await popover.present();
      const arrow = popover.shadowRoot!.querySelector('[part="arrow"]')!;
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
        const popover = document.createElement('ion-popover') as PopoverProbe;
        popover.component = document.createElement('div');
        popover.component.textContent = 'Content';
        popover.event = { target: anchor };
        popover.style.cssText = '--width:240px';
        document.body.append(popover);
        await popover.present();
        const content = popover.shadowRoot!.querySelector('[part="content"]')!;
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
      // The pressed button can grow before presentation; compare the surface with
      // the visual bounds read by the animation, rather than the resting button.
      await trigger.evaluate((el: MeasuredTrigger) => {
        const measure = el.getBoundingClientRect;
        el.getBoundingClientRect = () => {
          const rect = measure.call(el);
          if (!el.classList.contains('ios-theme-replace-element')) el.presentationBounds = rect;
          return rect;
        };
        el.restoreMeasurement = () => {
          el.getBoundingClientRect = measure;
          delete el.restoreMeasurement;
        };
      });
      await trigger.click();
      const popover = page.locator(`ion-popover[trigger="${id}"]`);
      await expect(popover).toBeVisible();
      await expect
        .poll(() =>
          popover.evaluate((el: HTMLIonPopoverElement) =>
            el
              .shadowRoot!.querySelector('[part="content"]')!
              .getAnimations()
              .every((a: Animation) => a.playState === 'finished'),
          ),
        )
        .toBe(true);
      const before = await trigger.evaluate((el: MeasuredTrigger) => {
        const rect = el.presentationBounds!;
        el.restoreMeasurement!();
        delete el.presentationBounds;
        return { x: rect.x, width: rect.width };
      });
      const geometry = await popover.evaluate((el: HTMLIonPopoverElement) => {
        const trigger = document.getElementById(el.trigger!)!;
        const pane = trigger.closest('ion-content')!;
        const scroll = pane.shadowRoot!.querySelector('[part="scroll"]')!;
        const style = getComputedStyle(scroll);
        const paneRect = pane.getBoundingClientRect();
        const content = el.shadowRoot!.querySelector('[part="content"]')!;
        const rect = content.getBoundingClientRect();
        const arrow = el.shadowRoot!.querySelector('[part="arrow"]')!;
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
          anchorLeft: anchor.left,
          anchorRight: anchor.right,
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
        // Near a rounded corner, the arrow may shift within the trigger bounds.
        expect(geometry.arrowCenter).toBeGreaterThanOrEqual(geometry.anchorLeft);
        expect(geometry.arrowCenter).toBeLessThanOrEqual(geometry.anchorRight);
        expect(Math.min(Math.abs(geometry.arrowBottom - geometry.top), Math.abs(geometry.arrowTop - geometry.bottom))).toBeLessThanOrEqual(
          1.5,
        );
      }
      await popover.evaluate(async (el: HTMLIonPopoverElement) => el.dismiss());
      await expect(popover).toBeHidden();
    }
  });
}

for (const tag of ['button', 'ion-button']) {
  for (const side of ['top', 'bottom', 'left', 'right'] as const) {
    test(`event reference points to the click on ${tag} for ${side} placement`, async ({ page }) => {
      await page.setViewportSize({ width: 1210, height: 834 });
      await page.goto('/main/index/popover');
      await page.waitForSelector('ion-popover.hydrated', { state: 'attached' });
      const result = await page.evaluate(
        async ({ tag, side }) => {
          const anchor = document.createElement(tag);
          anchor.style.cssText = 'position:fixed;left:500px;top:300px;width:200px;height:120px';
          anchor.textContent = 'Open';
          document.body.append(anchor);
          const popover = document.createElement('ion-popover') as PopoverProbe;
          popover.component = document.createElement('div');
          popover.component.textContent = 'Content';
          popover.style.cssText = '--width:240px;--height:180px';
          popover.reference = 'event';
          popover.event = { target: anchor, clientX: 520, clientY: 320 };
          popover.side = side;
          document.body.append(popover);
          await popover.present();
          const root = popover.shadowRoot!;
          const content = root.querySelector('.popover-content')!;
          const rect = content.getBoundingClientRect();
          const arrow = root.querySelector('[part="arrow"]')!.getBoundingClientRect();
          const origin = getComputedStyle(content).transformOrigin.split(' ').map(parseFloat);
          const layer = root.querySelector('[part="callout-glass"]')!;
          const layerRect = layer.getBoundingClientRect();
          const layerOrigin = getComputedStyle(layer).transformOrigin.split(' ').map(parseFloat);
          const horizontal = side === 'left' || side === 'right';
          const result = {
            arrow: horizontal ? arrow.top + arrow.height / 2 : arrow.left + arrow.width / 2,
            layerOriginX: layerRect.left + layerOrigin[0],
            layerOriginY: layerRect.top + layerOrigin[1],
            originX: rect.left + origin[0],
            originY: rect.top + origin[1],
            expected: horizontal ? 320.5 : 520.5,
            callout: root.querySelectorAll('[part="callout-glass"]').length,
            replacing: anchor.classList.contains('ios-theme-replace-element'),
          };
          await popover.dismiss();
          popover.remove();
          anchor.remove();
          return result;
        },
        { tag, side },
      );
      expect(result.callout).toBe(1);
      expect(result.replacing).toBe(false);
      expect(Math.abs(result.arrow - result.expected)).toBeLessThan(1);
      expect(Math.abs(result.originX - 520.5)).toBeLessThan(1);
      expect(Math.abs(result.originY - 320.5)).toBeLessThan(1);
      expect(Math.abs(result.layerOriginX - 520.5)).toBeLessThan(1);
      expect(Math.abs(result.layerOriginY - 320.5)).toBeLessThan(1);
    });
  }
}
