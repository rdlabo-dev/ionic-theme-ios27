import { afterEach, expect, test } from 'vitest';
import { createVerticalNavigation } from '../../packages/capacitor-native-ui/src/native/shared/vertical-navigation';

afterEach(() => document.body.replaceChildren());
const page = (owner = document.body) => owner.appendChild(document.createElement('main'));

test('push, pop and cancellation follow the Web pages without inventing ancestors', () => {
  const state = createVerticalNavigation();
  const root = page(),
    detail = page(),
    unknown = page();
  expect(state.read(root)).toEqual([root]);
  const push = state.begin(detail, root, 'forward');
  expect(state.read(root)).toEqual([root]);
  expect(state.read(detail)).toEqual([root, detail]);
  push(false);
  const pop = state.begin(root, detail, 'back');
  expect(state.read(root)).toEqual([root]);
  pop(true);
  expect(state.read(detail)).toEqual([root, detail]);
  state.begin(root, detail, 'back')(false);
  expect(state.read(root)).toEqual([root]);
  state.begin(unknown, root, 'back')(false);
  expect(state.read(unknown)).toEqual([unknown]);
});

test('root navigation resets the stack and a late release cannot undo newer navigation', () => {
  const state = createVerticalNavigation();
  const root = page(),
    first = page(),
    second = page();
  state.read(root);
  const old = state.begin(first, root, 'forward');
  state.read(first);
  const latest = state.begin(second, first, 'root');
  old(true);
  expect(state.read(second)).toEqual([second]);
  latest(false);
  expect(state.read(second)).toEqual([second]);
});

test('modal navigation leaves the underlying tab history intact', () => {
  const state = createVerticalNavigation();
  const root = page(),
    detail = page();
  state.read(root);
  state.begin(detail, root, 'forward')(false);
  const modal = document.body.appendChild(document.createElement('ion-modal'));
  const modalRoot = page(modal),
    modalDetail = page(modal);
  state.read(modalRoot);
  state.begin(modalDetail, modalRoot, 'forward')(false);
  expect(state.read(modalDetail)).toEqual([modalRoot, modalDetail]);
  modal.remove();
  expect(state.read(detail)).toEqual([root, detail]);
});

test('switching tabs restores each tab stack without treating the switch as a push', () => {
  const state = createVerticalNavigation();
  const tabs = document.body.appendChild(document.createElement('ion-tabs'));
  const first = tabs.appendChild(document.createElement('ion-tab-button'));
  const second = tabs.appendChild(document.createElement('ion-tab-button'));
  first.classList.add('tab-selected');
  const root = page(tabs),
    detail = page(tabs),
    other = page(tabs);
  state.read(root);
  state.begin(detail, root, 'forward')(false);
  first.classList.remove('tab-selected');
  second.classList.add('tab-selected');
  expect(state.read(other)).toEqual([other]);
  second.classList.remove('tab-selected');
  first.classList.add('tab-selected');
  expect(state.read(detail)).toEqual([root, detail]);
});

test('reading a destination before tab selection changes cannot overwrite another page history', () => {
  const state = createVerticalNavigation();
  const tabs = document.body.appendChild(document.createElement('ion-tabs'));
  const selected = tabs.appendChild(document.createElement('ion-tab-button'));
  selected.classList.add('tab-selected');
  const root = page(tabs),
    detail = page(tabs),
    other = page(tabs);
  state.begin(detail, root, 'forward')(false);
  expect(state.read(other)).toEqual([other]);
  selected.classList.remove('tab-selected');
  expect(state.read(detail)).toEqual([root, detail]);
  expect(state.read(root)).toEqual([root]);
  expect(state.read(detail)).toEqual([root, detail]);
});

test('cancellation preserves saved destination ancestry as well as the leaving page', () => {
  const state = createVerticalNavigation();
  const root = page(),
    detail = page(),
    other = page();
  state.begin(detail, root, 'forward')(false);
  const release = state.begin(detail, other, 'forward');
  expect(state.read(detail)).toEqual([other, detail]);
  release(true);
  expect(state.read(other)).toEqual([other]);
  expect(state.read(detail)).toEqual([root, detail]);
});
