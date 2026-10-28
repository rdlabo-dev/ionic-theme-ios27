import { mockSnapshotOwnership } from './snapshot-scope-fixture';
import { beforeEach } from 'vitest';
import { observeVerticalBarsModals } from '../../packages/capacitor-native-ui/src/native/shared/modal';
import { prehideVerticalBarsToolbarSources } from '../../packages/capacitor-native-ui/src/native/prehide';
import { expect, test, vi } from 'vitest';
import { createVerticalBarsWebProjection } from '../../packages/capacitor-native-ui/src/native/vertical-bars-web';
import { getProjectionState } from '../../packages/capacitor-native-ui/src/native/shared/covered-source';
const projectionState = getProjectionState(document);
const { sourcesChangedEvent } = projectionState;
import { setVerticalBarsPlacement } from '../../packages/capacitor-native-ui/src/native/shared/dom';

let owners: Set<HTMLElement>, visibleOwners: Set<HTMLElement>, preparedOwners: Set<HTMLElement>, nativeOwners: Set<HTMLElement>;
beforeEach(() => {
  ({ owners, visibleOwners, preparedOwners } = mockSnapshotOwnership(projectionState));
  nativeOwners = new Set();
  vi.spyOn(projectionState, 'nativeOwns').mockImplementation((source) => nativeOwners.has(source));
});

const mountEligibleBackButton = () => {
  document.body.innerHTML = `
    <ion-app class="ios-theme-vertical-bars">
      <main class="ion-page">
        <ion-header><ion-toolbar class="ios"><ion-back-button class="ios"></ion-back-button></ion-toolbar></ion-header>
      </main>
    </ion-app>`;
  const button = document.querySelector('ion-back-button') as HTMLElement;
  button.style.display = 'block';
  button.style.visibility = 'visible';
  button.getBoundingClientRect = () => ({ width: 44, height: 44 }) as DOMRect;
  // Eligibility requires prehide's per-page placement capture; mark it directly.
  setVerticalBarsPlacement(button, true);
};

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

test('disabling Ionic discovery leaves an otherwise eligible verticalBars back button under application ownership', async () => {
  mountEligibleBackButton();
  const enabled = createVerticalBarsWebProjection(document, {});
  await nextFrame();
  expect(enabled.getStatus().projected).toBe(1);
  expect(document.querySelector('.ios-theme-vertical-bars-back-button-projection')).not.toBeNull();
  await enabled.destroy();

  mountEligibleBackButton();
  const handle = createVerticalBarsWebProjection(document, { ionic: { auto: false } });
  await nextFrame();

  expect(handle.getStatus()).toEqual({ state: 'web', projected: 0, updates: 0 });
  expect(document.querySelector('ion-back-button')?.hasAttribute('data-native-ui-projected')).toBe(false);
  expect(document.querySelector('.ios-theme-vertical-bars-back-button-projection')).toBeNull();

  await handle.destroy();
});

test('a back button inside an ion-buttons group is projected only through the back slot', async () => {
  document.body.innerHTML = `
    <ion-app class="ios-theme-vertical-bars">
      <main class="ion-page">
        <ion-header><ion-toolbar class="ios"><ion-buttons slot="start" class="ios"><ion-back-button class="ios"></ion-back-button></ion-buttons></ion-toolbar></ion-header>
      </main>
    </ion-app>`;
  const button = document.querySelector('ion-back-button') as HTMLElement;
  button.style.display = 'block';
  button.style.visibility = 'visible';
  button.getBoundingClientRect = () => ({ width: 44, height: 44 }) as DOMRect;
  setVerticalBarsPlacement(button, true);

  const handle = createVerticalBarsWebProjection(document, {});
  try {
    await nextFrame();
    expect(handle.getStatus().projected).toBe(1);
    expect(document.querySelectorAll('.ios-theme-vertical-bars-back-button-projection')).toHaveLength(1);
    expect(document.querySelector('.ios-theme-vertical-bars-toolbar-projection')).toBeNull();
  } finally {
    await handle.destroy();
  }
});

test('explicit standalone text action projects, forwards clicks and restores its source', async () => {
  document.body.innerHTML = `<ion-app class="ios-theme-vertical-bars"><main class="ion-page">
    <ion-header><ion-toolbar><ion-button data-vertical-bars="true">Save</ion-button></ion-toolbar></ion-header>
    </main></ion-app>`;
  const source = document.querySelector<HTMLElement>('ion-button')!;
  source.style.display = 'block';
  source.style.visibility = 'visible';
  source.getBoundingClientRect = () => ({ width: 44, height: 44 }) as DOMRect;
  let clicks = 0;
  source.addEventListener('click', () => clicks++);
  const prehide = prehideVerticalBarsToolbarSources(document, undefined, undefined, { controls: { button: false } });
  const handle = createVerticalBarsWebProjection(document, {});
  try {
    await nextFrame();
    const clone = document.querySelector<HTMLElement>('.ios-theme-vertical-bars-toolbar-projection')!;
    expect(clone).not.toBeNull();
    expect(clone.textContent).toBe('Save');
    clone.click();
    expect(clicks).toBe(1);
    expect(source.getAttribute('aria-hidden')).toBe('true');
  } finally {
    await handle.destroy();
    prehide.stop();
  }
  expect(source.hasAttribute('aria-hidden')).toBe(false);
  expect(document.querySelector('.ios-theme-vertical-bars-toolbar-projection')).toBeNull();
});

test('a single-action group and its action share the same snapshot projection target', async () => {
  document.body.innerHTML = `<ion-app class="ios-theme-vertical-bars"><main class="ion-page">
    <ion-header><ion-toolbar><ion-buttons><ion-button data-vertical-bars="true">Save</ion-button></ion-buttons></ion-toolbar></ion-header>
    </main></ion-app>`;
  const group = document.querySelector<HTMLElement>('ion-buttons')!;
  const source = document.querySelector<HTMLElement>('ion-button')!;
  for (const element of [group, source]) {
    element.style.display = 'block';
    element.style.visibility = 'visible';
    element.getBoundingClientRect = () => ({ width: 44, height: 44 }) as DOMRect;
  }
  source.setAttribute('data-native-ui-projected', '');
  preparedOwners.add(source);
  const prehide = prehideVerticalBarsToolbarSources(document);
  const handle = createVerticalBarsWebProjection(document, {}, () => false);
  try {
    await nextFrame();
    const clone = document.querySelector<HTMLElement>('.ios-theme-vertical-bars-toolbar-projection');
    expect(clone).not.toBeNull();
    expect(projectionState.getTarget(group)).toBe(clone);
    expect(projectionState.getTarget(source)).toBe(clone);
    expect(clone?.hasAttribute('data-native-ui-proxy-prepared')).toBe(true);
    clone!.setAttribute('data-native-ui-snapshot-content', '');
    clone!.setAttribute('data-native-ui-snapshot-positioned', '');
    // Popover/background reacquisition must not destroy an already decoded target.
    window.dispatchEvent(new CustomEvent('nativeUIVerticalBarsAcquire', { detail: { instant: true } }));
    expect(clone?.isConnected).toBe(true);
    await nextFrame();
    expect(projectionState.getTarget(source)).toBe(clone);
    expect(clone!.hasAttribute('data-native-ui-snapshot-content')).toBe(true);
    expect(clone!.hasAttribute('data-native-ui-snapshot-positioned')).toBe(true);
    // A missing image can return the same target to ordinary Web presentation.
    preparedOwners.delete(source);
    owners.add(source);
    owners.add(group);
    window.dispatchEvent(new Event(sourcesChangedEvent));
    await nextFrame();
    expect(clone?.hasAttribute('data-native-ui-proxy-prepared')).toBe(false);
    expect(clone?.style.visibility).toBe('visible');
  } finally {
    preparedOwners.delete(source);
    owners.delete(source);
    owners.delete(group);
    await handle.destroy();
    prehide.stop();
  }
});

test('a covered back-only rail survives native reacquisition while dragging a sheet', async () => {
  mountEligibleBackButton();
  const source = document.querySelector<HTMLElement>('ion-back-button')!;
  owners.add(source);
  const stop = observeVerticalBarsModals(document);
  const handle = createVerticalBarsWebProjection(document, {}, () => false);
  try {
    await nextFrame();
    const clone = projectionState.getTarget(source)!;
    expect(clone?.isConnected).toBe(true);
    clone.setAttribute('data-native-ui-snapshot', 'prepared-back');
    clone.setAttribute('data-native-ui-snapshot-visible', '');
    const modal = document.createElement('ion-modal');
    document.querySelector('ion-app')!.append(modal);
    modal.dispatchEvent(new CustomEvent('ionModalWillPresent', { bubbles: true }));
    for (let n = 0; n < 3; n++) {
      window.dispatchEvent(new CustomEvent('nativeUIVerticalBarsAcquire', { detail: { instant: true } }));
      expect(clone.isConnected).toBe(true);
      expect(clone.getAttribute('data-native-ui-snapshot')).toBe('prepared-back');
      await nextFrame();
      expect(projectionState.getTarget(source)).toBe(clone);
    }
  } finally {
    owners.delete(source);
    await handle.destroy();
    stop();
  }
});

test('changing modal controls retains the covered background image target', async () => {
  mountEligibleBackButton();
  const app = document.querySelector('ion-app')!;
  const source = document.querySelector<HTMLElement>('ion-back-button')!;
  owners.add(source);
  visibleOwners.add(source);
  const stop = observeVerticalBarsModals(document);
  const handle = createVerticalBarsWebProjection(document, {}, () => false);
  try {
    await nextFrame();
    const first = projectionState.getTarget(source)!;
    first.setAttribute('data-native-ui-snapshot', 'background');
    const modal = document.createElement('ion-modal');
    modal.innerHTML =
      '<main class="ion-page"><ion-header><ion-toolbar class="ios"><ion-button class="ios" data-vertical-bars="true">Close</ion-button></ion-toolbar></ion-header></main>';
    const wrapper = document.createElement('div');
    wrapper.setAttribute('part', 'content');
    Object.defineProperty(wrapper, 'offsetWidth', { value: window.innerWidth });
    wrapper.getAnimations = () => [];
    modal.attachShadow({ mode: 'open' }).append(wrapper);
    app.append(modal);
    const close = modal.querySelector<HTMLElement>('ion-button')!;
    close.style.display = 'block';
    close.style.visibility = 'visible';
    preparedOwners.add(close);
    close.getBoundingClientRect = () => DOMRect.fromRect({ width: 48, height: 48 });
    setVerticalBarsPlacement(close, true);
    modal.dispatchEvent(new CustomEvent('ionModalWillPresent', { bubbles: true }));
    await nextFrame();
    await nextFrame();
    expect(projectionState.getTarget(source)).toBe(first);
    expect(first.getAttribute('data-native-ui-snapshot')).toBe('background');
    expect(projectionState.getTarget(source)?.isConnected).toBe(true);
    expect(app.classList.contains('ios-theme-vertical-bars-toolbar-ready')).toBe(true);
    expect(modal.classList.contains('ios-theme-vertical-bars-toolbar-ready')).toBe(true);
    const outgoing = projectionState.getTarget(close)!;
    expect(outgoing.isConnected).toBe(true);
    owners.add(close);
    visibleOwners.add(close);
    modal.dispatchEvent(new CustomEvent('ionModalWillDismiss', { bubbles: true }));
    close.closest('.ion-page')!.dispatchEvent(new CustomEvent('ionViewWillLeave', { bubbles: true }));
    await nextFrame();
    expect(outgoing.isConnected).toBe(true);
    modal.dispatchEvent(new CustomEvent('ionModalDidDismiss', { bubbles: true }));
    // Ionic may keep the host in the DOM until the next microtask. No outgoing
    // clone may survive the loss of the Modal's positioning class for a frame.
    expect(modal.isConnected).toBe(true);
    expect(outgoing.isConnected).toBe(false);
    expect(modal.querySelector('.ion-cloned-element')).toBeNull();
    owners.delete(close);
    visibleOwners.delete(close);
    expect(projectionState.getTarget(source)).toBe(first);
    expect(first.isConnected).toBe(true);
    expect(first.getAttribute('data-native-ui-snapshot')).toBe('background');
  } finally {
    preparedOwners.clear();
    owners.delete(source);
    visibleOwners.delete(source);
    await handle.destroy();
    stop();
  }
});

test('native acquisition updates existing image targets without measuring or creating Web controls', async () => {
  mountEligibleBackButton();
  const source = document.querySelector<HTMLElement>('ion-back-button')!;
  preparedOwners.add(source);
  let web = false;
  const handle = createVerticalBarsWebProjection(document, {}, () => web);
  try {
    await nextFrame();
    const clone = projectionState.getTarget(source)!;
    const incoming = document.createElement('ion-button');
    incoming.className = 'ios';
    incoming.textContent = 'Save';
    incoming.setAttribute('data-vertical-bars', 'true');
    incoming.style.visibility = 'visible';
    incoming.getBoundingClientRect = () => DOMRect.fromRect({ width: 44, height: 44 });
    source.parentElement!.append(incoming);
    setVerticalBarsPlacement(incoming, true);
    web = true;
    const measure = vi.spyOn(source, 'getBoundingClientRect');
    source.setAttribute('data-native-ui-vertical-bars', '');
    nativeOwners.add(source);
    window.dispatchEvent(new CustomEvent('nativeUIVerticalBarsAcquire', { detail: { instant: true } }));
    expect(projectionState.getTarget(source)).toBe(clone);
    expect(clone.hasAttribute('data-native-ui-vertical-bars')).toBe(true);
    expect(source.getAttribute('aria-hidden')).toBeNull();
    // Native records the original ARIA, then takes ownership in the same update.
    source.setAttribute('aria-hidden', 'true');
    expect(clone.isConnected).toBe(true);
    expect(measure).not.toHaveBeenCalled();
    expect(!!projectionState.getTarget(incoming)).toBe(false);
    expect(incoming.getAttribute('aria-hidden')).toBeNull();
    measure.mockRestore();
  } finally {
    preparedOwners.delete(source);
    await handle.destroy();
    expect(source.hasAttribute('data-native-ui-projected')).toBe(true);
    expect(source.getAttribute('aria-hidden')).toBe('true');
  }
});

test.each([
  { surface: 'page', grouped: true },
  { surface: 'modal', grouped: true },
  { surface: 'page', grouped: false },
  { surface: 'page', grouped: true, partial: true },
])(
  'native $surface actions (grouped=$grouped) have hidden image targets before the first capture',
  async ({ surface, grouped, partial }) => {
    vi.spyOn(projectionState, 'snapshotsEnabled', 'get').mockReturnValue(true);
    document.body.innerHTML = `<style>[data-native-ui-projected], [data-native-ui-projected] * { visibility: hidden !important; }</style><ion-app class="ios-theme-vertical-bars">${surface === 'modal' ? '<ion-modal>' : ''}
    <main class="ion-page"><ion-header><ion-toolbar class="ios"><ion-buttons slot="end" class="${grouped ? '' : 'ios-theme-disabled'}">
    ${partial ? '<ion-back-button class="ios"></ion-back-button>' : ''}<ion-button class="ios" data-vertical-bars="true">Close</ion-button>
    <ion-button class="ios" data-vertical-bars="true">Done</ion-button>
    </ion-buttons></ion-toolbar></ion-header></main>${surface === 'modal' ? '</ion-modal>' : ''}</ion-app>`;
    const modal = document.querySelector('ion-modal');
    const wrapper = document.createElement('div');
    wrapper.setAttribute('part', 'content');
    Object.defineProperty(wrapper, 'offsetWidth', { value: innerWidth });
    wrapper.getAnimations = () => [];
    modal?.attachShadow({ mode: 'open' }).append(wrapper);
    const group = document.querySelector<HTMLElement>('ion-buttons')!;
    const actions = Array.from(group.querySelectorAll<HTMLElement>('ion-button'));
    for (const element of [group, ...actions]) {
      element.style.display = 'block';
      element.style.visibility = 'visible';
      element.getBoundingClientRect = () => DOMRect.fromRect({ width: 44, height: 44 });
      setVerticalBarsPlacement(element, true);
    }
    group.setAttribute('data-native-ui-vertical-bars', '');
    if (grouped && !partial) {
      nativeOwners.add(group);
      group.setAttribute('data-native-ui-projected', '');
      group.setAttribute('aria-hidden', 'true');
    }
    actions.forEach((action) => {
      if (!grouped || partial) {
        nativeOwners.add(action);
        if (!partial) action.setAttribute('data-native-ui-vertical-bars', '');
        action.setAttribute('data-native-ui-projected', '');
        action.setAttribute('aria-hidden', 'true');
      }
      action.setAttribute('data-native-ui-vertical-bars-member', '');
    });
    const stop = observeVerticalBarsModals(document, () => true);
    modal?.dispatchEvent(new CustomEvent('ionModalWillPresent', { bubbles: true }));
    const handle = createVerticalBarsWebProjection(document, {}, () => false);
    try {
      await nextFrame();
      if (modal) {
        expect(projectionState.getTarget(group)).toBeUndefined();
        for (const source of actions) expect(projectionState.getTarget(source)).toBeUndefined();
        modal.dispatchEvent(new CustomEvent('ionModalDidPresent', { bubbles: true }));
        await nextFrame();
      }
      const target = projectionState.getTarget(group)!;
      expect(target?.isConnected).toBe(true);
      expect(target.hasAttribute('data-native-ui-proxy-prepared')).toBe(true);
      for (const source of actions) expect(projectionState.getTarget(source)?.isConnected).toBe(true);
      expect(projectionState.getTarget(actions[0])).not.toBe(projectionState.getTarget(actions[1]));
      // Native may release a source before its prepared proxy is retired.
      nativeOwners.delete(actions[0]);
      actions[0].removeAttribute('data-native-ui-vertical-bars');
      actions[0].removeAttribute('data-native-ui-vertical-bars-member');
      actions[0].removeAttribute('data-native-ui-projected');
      actions[0].removeAttribute('aria-hidden');
    } finally {
      await handle.destroy();
      expect(actions[0].hasAttribute('aria-hidden')).toBe(false);
      expect(actions[1].hasAttribute('data-native-ui-projected')).toBe(!grouped || !!partial);
      stop();
    }
  },
);
