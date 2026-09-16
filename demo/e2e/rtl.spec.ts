import { expect, test } from '@playwright/test';

for (const direction of ['ltr', 'rtl'] as const) {
  test(`${direction} mirrors logical spacing with asymmetric safe areas`, async ({ page }) => {
    await page.goto('/main/index', { waitUntil: 'networkidle' });
    await page.evaluate((dir) => {
      const fixture = document.createElement('div');
      fixture.id = 'rtl-probe';
      fixture.dir = dir;
      fixture.style.cssText =
        'position:fixed;inset:0;z-index:99999;--ion-safe-area-left:20px;--ion-safe-area-right:8px;--ios-theme-menu-width:0px';

      const fab = document.createElement('ion-fab');
      fab.id = 'fab-probe';
      fab.mode = 'ios';
      fab.className = 'fab-horizontal-start';
      fab.innerHTML = '<ion-fab-button>+</ion-fab-button>';

      const tabs = document.createElement('ion-tab-bar');
      tabs.id = 'tabs-probe';
      tabs.mode = 'ios';
      tabs.slot = 'bottom';
      tabs.className = 'tab-bar-position-start';
      tabs.innerHTML = '<ion-tab-button>One</ion-tab-button><ion-tab-button>Two</ion-tab-button>';

      const list = document.createElement('ion-list');
      list.id = 'list-probe';
      list.mode = 'ios';
      list.className = 'list-inset';
      list.innerHTML =
        '<ion-radio-group><div class="radio-group-top">Supporting text</div><ion-item>Item</ion-item></ion-radio-group><ion-note>Footer</ion-note>';

      const toolbar = document.createElement('ion-toolbar');
      toolbar.id = 'toolbar-probe';
      toolbar.mode = 'ios';
      toolbar.className = 'toolbar-searchbar';
      toolbar.innerHTML = '<ion-buttons slot="start"><ion-button>Action</ion-button></ion-buttons><ion-searchbar></ion-searchbar>';

      fixture.append(fab, tabs, list, toolbar);
      document.body.append(fixture);
    }, direction);

    await expect(page.locator('#fab-probe')).toHaveClass(/hydrated/);
    await expect(page.locator('#tabs-probe')).toHaveClass(/hydrated/);
    await expect(page.locator('#list-probe')).toHaveClass(/hydrated/);

    const values = await page.locator('#rtl-probe').evaluate((fixture) => {
      const direction = fixture.getAttribute('dir');
      const style = (selector: string) => getComputedStyle(fixture.querySelector(selector)!);
      const fab = fixture.querySelector('#fab-probe')!.getBoundingClientRect();
      const tabs = fixture.querySelector('#tabs-probe')!.getBoundingClientRect();
      const note = style('#list-probe > ion-note');
      const radio = style('.radio-group-top');
      const toolbarButtons = style('#toolbar-probe ion-buttons');

      return {
        fabStart: direction === 'ltr' ? fab.left : innerWidth - fab.right,
        tabsStart: direction === 'ltr' ? tabs.left : innerWidth - tabs.right,
        noteStart: note.marginInlineStart,
        noteEnd: note.marginInlineEnd,
        radioStart: radio.paddingInlineStart,
        radioEnd: radio.paddingInlineEnd,
        toolbarGap: toolbarButtons.marginInlineEnd,
      };
    });

    expect(values.fabStart).toBeCloseTo(16, 1);
    expect(values.tabsStart).toBeCloseTo(direction === 'ltr' ? 36 : 24, 1);
    expect(values.noteStart).toBe(direction === 'ltr' ? '40px' : '28px');
    expect(values.noteEnd).toBe(direction === 'ltr' ? '28px' : '40px');
    expect(values.radioStart).toBe(direction === 'ltr' ? '40px' : '28px');
    expect(values.radioEnd).toBe(direction === 'ltr' ? '28px' : '40px');
    expect(values.toolbarGap).toBe('6px');
  });
}
