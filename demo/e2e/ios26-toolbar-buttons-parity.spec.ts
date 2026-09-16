import { expect, test } from '@playwright/test';

test.describe('iOS 26 toolbar button parity', () => {
  for (const direction of ['ltr', 'rtl'] as const) {
    test(`renders adjacent ${direction} actions as independent native-size glass controls`, async ({ page }) => {
      await page.goto('/main/index', { waitUntil: 'networkidle' });
      await page.evaluate((dir) => {
        const toolbar = document.createElement('ion-toolbar');
        toolbar.id = 'toolbar-buttons-probe';
        toolbar.mode = 'ios';
        toolbar.dir = dir;
        toolbar.innerHTML = `
          <ion-buttons slot="end">
            <ion-button aria-label="Add">+</ion-button>
            <ion-button>Done</ion-button>
          </ion-buttons>`;
        document.body.append(toolbar);
      }, direction);

      const group = page.locator('#toolbar-buttons-probe ion-buttons');
      const buttons = group.locator('ion-button');
      await expect(buttons).toHaveCount(2);
      await expect(buttons.first()).toHaveClass(/hydrated/);

      const geometry = await group.evaluate((element) => {
        const children = Array.from(element.querySelectorAll('ion-button'));
        const rects = children.map((child) => child.getBoundingClientRect()).sort((a, b) => a.left - b.left);
        const [first, second] = rects;
        const groupStyle = getComputedStyle(element);
        const nativeStyles = children.map((child) => getComputedStyle(child.shadowRoot!.querySelector('[part=native]')!));
        return {
          groupBackground: groupStyle.backgroundColor,
          groupShadow: groupStyle.boxShadow,
          gap: Math.abs(second.left - first.right),
          heights: [first.height, second.height],
          radii: nativeStyles.map((style) => style.borderRadius),
          backgrounds: nativeStyles.map((style) => style.backgroundColor),
        };
      });

      expect(geometry.groupBackground).toBe('rgba(0, 0, 0, 0)');
      expect(geometry.groupShadow).toBe('none');
      expect(geometry.gap).toBeCloseTo(12, 1);
      expect(geometry.heights).toEqual([44, 44]);
      expect(geometry.radii).toEqual(['22px', '22px']);
      expect(geometry.backgrounds.every((value) => value !== 'rgba(0, 0, 0, 0)')).toBe(true);

      await buttons.last().evaluate((button) => button.classList.add('ion-activated'));
      const activated = await buttons.last().evaluate((button) => ({
        transform: getComputedStyle(button).transform,
        color: getComputedStyle(button.shadowRoot!.querySelector('[part=native]')!).color,
      }));
      expect(activated.transform).not.toBe('none');
      expect(activated.color).toBe('rgba(0, 0, 0, 0.1)');
    });
  }

  test('keeps a single toolbar action on its measured 44pt platter', async ({ page }) => {
    await page.goto('/main/index', { waitUntil: 'networkidle' });
    await page.evaluate(() => {
      const toolbar = document.createElement('ion-toolbar');
      toolbar.id = 'single-toolbar-button-probe';
      toolbar.mode = 'ios';
      toolbar.innerHTML = '<ion-buttons slot="end"><ion-button>Done</ion-button></ion-buttons>';
      document.body.append(toolbar);
    });

    const group = page.locator('#single-toolbar-button-probe ion-buttons');
    await expect(group.locator('ion-button')).toHaveClass(/hydrated/);
    const geometry = await group.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { width: rect.width, height: rect.height, radius: style.borderRadius, background: style.backgroundColor };
    });
    expect(geometry.width).toBeCloseTo(73, 0);
    expect(geometry.height).toBe(44);
    expect(geometry.radius).toBe('22px');
    expect(geometry.background).not.toBe('rgba(0, 0, 0, 0)');
  });
});
