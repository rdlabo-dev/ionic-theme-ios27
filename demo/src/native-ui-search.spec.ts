import { afterEach, expect, test, vi } from 'vitest';
import { createSearchSupport } from '../../packages/capacitor-native-ui/src/native/components/searchable-tabs';
import { registerNativeSearch } from '../../packages/capacitor-native-ui/src/native-integration';
import { createCandidate } from '../../packages/capacitor-native-ui/src/native/shared/candidate';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

const setup = () => {
  document.body.innerHTML = `<ion-tabs><ion-tab-bar slot="bottom"></ion-tab-bar><section class="ion-page ion-page-hidden">
    <ion-fab slot="fixed"><ion-fab-button>Search</ion-fab-button></ion-fab>
    <ion-footer><ion-toolbar><ion-buttons slot="start"><ion-button>Close</ion-button></ion-buttons>
      <ion-searchbar class="ios"><input class="searchbar-input"><span class="searchbar-search-icon">Search</span></ion-searchbar>
    </ion-toolbar></ion-footer></section></ion-tabs>`;
  const page = document.querySelector<HTMLElement>('section')!;
  const tabs = document.querySelector<HTMLElement>('ion-tab-bar')!;
  const trigger = document.querySelector<HTMLElement>('ion-fab-button')!;
  const footer = document.querySelector<HTMLElement>('ion-footer')!;
  const bar = document.querySelector<HTMLIonSearchbarElement>('ion-searchbar')!;
  Object.assign(bar, {
    autocapitalize: 'off',
    autocomplete: 'off',
    showClearButton: 'always',
    showCancelButton: 'never',
    type: 'search',
    setFocus: async () => {},
  });
  Object.assign(document.querySelector('ion-button')!, { fill: 'default' });
  Object.assign(trigger, { type: 'button' });
  trigger.attachShadow({ mode: 'open' }).innerHTML = '<button part="native"></button>';
  let emptyTrigger = false;
  document.querySelectorAll<HTMLElement>('*').forEach((element) => {
    Object.assign(element.style, {
      visibility: 'visible',
      opacity: '1',
      transform: 'none',
      fontSize: '16px',
      color: 'black',
      backgroundColor: 'transparent',
    });
    element.getBoundingClientRect = () => {
      const hidden = !!element.closest('.ion-page-hidden') || (element === trigger && emptyTrigger);
      return { x: 10, y: 10, left: 10, top: 10, right: 50, bottom: 50, width: hidden ? 0 : 40, height: hidden ? 0 : 40 } as DOMRect;
    };
  });
  const computed = getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const style = computed(element);
    Object.defineProperty(style, 'backdropFilter', { value: 'blur(10px)' });
    return style;
  });
  registerNativeSearch(tabs, trigger, footer);
  const ids = new WeakMap<Element, string>();
  let next = 0;
  const id = (element: Element) => {
    if (!ids.has(element)) ids.set(element, String(++next));
    return ids.get(element)!;
  };
  const search = createSearchSupport(document, id, () => {});
  const candidates = () => search.decorate([createCandidate(tabs, 'tab-bar', id)], () => false);
  return { page, tabs, trigger, footer, bar, id, search, candidates, setEmptyTrigger: (value: boolean) => (emptyTrigger = value) };
};

test('a cached hidden search page cannot invalidate ordinary tabs and reuses only measured search geometry', () => {
  const { page, search, candidates, setEmptyTrigger } = setup();
  const read = () => candidates()[0].control.search;
  try {
    expect(read()).toBeUndefined();
    page.classList.remove('ion-page-hidden');
    const available = read();
    expect(available?.available).toBe(true);
    expect(available?.trigger.width).toBe(40);
    page.classList.add('ion-page-hidden');
    const cached = read();
    expect(cached?.available).toBe(false);
    expect(cached?.trigger.width).toBe(40);
    page.classList.remove('ion-page-hidden');
    setEmptyTrigger(true);
    expect(read()?.available).toBe(false);
    setEmptyTrigger(false);
    expect(read()?.available).toBe(true);
  } finally {
    search.destroy();
  }
});

test('rejected search keeps overlapping tabs on the Web and recovers when placement changes', () => {
  const { page, tabs, trigger, id, search, candidates } = setup();
  let tabX = 87;
  const rect = (x: number, width: number) =>
    ({ x, y: 400, left: x, right: x + width, top: 400, bottom: 462, width, height: 62 }) as DOMRect;
  tabs.getBoundingClientRect = () => rect(tabX, 299);
  trigger.getBoundingClientRect = () => rect(325, 61);
  page.classList.remove('ion-page-hidden');
  try {
    expect(candidates()[0].control.search?.available).toBe(true);
    search.reject([id(tabs)]);
    expect(candidates()).toHaveLength(0);

    // A cached page's absent trigger must not remove another page's ordinary tabs.
    page.classList.add('ion-page-hidden');
    expect(candidates()).toHaveLength(1);
    page.classList.remove('ion-page-hidden');
    expect(candidates()).toHaveLength(0);

    tabX = 16;
    expect(candidates()[0].control.search?.available).toBe(true);
    search.reject([id(tabs)]);
    const remaining = candidates();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].element).toBe(tabs);
    expect(remaining[0].control.search).toBeUndefined();
  } finally {
    search.destroy();
  }
});

test.each(['footer opt-out', 'trigger color', 'trigger theme opt-out', 'trigger shell opt-out', 'unsupported searchbar'])(
  '%s preserves access to an overlapping Web search trigger',
  (reason) => {
    const { page, tabs, trigger, footer, bar, search, candidates } = setup();
    let tabX = 87;
    const rect = (x: number, width: number) =>
      ({ x, y: 400, left: x, right: x + width, top: 400, bottom: 462, width, height: 62 }) as DOMRect;
    tabs.getBoundingClientRect = () => rect(tabX, 299);
    trigger.getBoundingClientRect = () => rect(325, 61);
    if (reason === 'footer opt-out') footer.setAttribute('data-shell', 'disabled');
    else if (reason === 'trigger color') Object.assign(trigger, { color: 'primary' });
    else if (reason === 'trigger theme opt-out') trigger.classList.add('ios-theme-disabled');
    else if (reason === 'trigger shell opt-out') trigger.setAttribute('data-shell', 'disabled');
    else bar.maxlength = 12;
    page.classList.remove('ion-page-hidden');
    try {
      expect(candidates()).toHaveLength(0);
      trigger.style.visibility = 'hidden';
      expect(candidates()).toHaveLength(1);
      trigger.style.visibility = 'visible';
      expect(candidates()).toHaveLength(0);
      page.classList.add('ion-page-hidden');
      expect(candidates()).toHaveLength(1);
      page.classList.remove('ion-page-hidden');
      tabX = 16;
      const remaining = candidates();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].control.search).toBeUndefined();
    } finally {
      search.destroy();
    }
  },
);

test('an unavailable cached search cannot cover its visible Web trigger but survives on a hidden page', () => {
  const { page, tabs, trigger, bar, search, candidates } = setup();
  const rect = (x: number, width: number) =>
    ({ x, y: 400, left: x, right: x + width, top: 400, bottom: 462, width, height: 62 }) as DOMRect;
  tabs.getBoundingClientRect = () => rect(87, 299);
  trigger.getBoundingClientRect = () => rect(325, 61);
  page.classList.remove('ion-page-hidden');
  try {
    expect(candidates()[0].control.search?.available).toBe(true);
    bar.maxlength = 12;
    expect(candidates()).toHaveLength(0);
    page.classList.add('ion-page-hidden');
    const cached = candidates();
    expect(cached).toHaveLength(1);
    expect(cached[0].control.search?.available).toBe(false);
    page.classList.remove('ion-page-hidden');
    bar.maxlength = undefined;
    expect(candidates()[0].control.search?.available).toBe(true);
  } finally {
    search.destroy();
  }
});
