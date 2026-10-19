import { afterEach, expect, test, vi } from 'vitest';
import { addSearchDismissButton } from '../../packages/theme-ios27/src/tab-bar-searchable/dismiss-button';

afterEach(() => {
  document.body.replaceChildren();
});

const setup = () => {
  document.body.innerHTML =
    '<ion-footer><ion-toolbar><ion-buttons slot="start"><ion-button></ion-button></ion-buttons><ion-searchbar><input></ion-searchbar></ion-toolbar></ion-footer>';
  const footer = document.querySelector('ion-footer')!;
  const original = footer.querySelector('ion-button')!;
  const clicked = vi.fn();
  original.addEventListener('click', clicked);
  addSearchDismissButton(footer);
  const dismiss = footer.querySelector<HTMLElement>('.ios-theme-searchable-dismiss ion-button')!;
  dismiss.getBoundingClientRect = () => ({ left: 0, top: 0, right: 48, bottom: 48, width: 48, height: 48 }) as DOMRect;
  const input = footer.querySelector('input')!;
  input.focus();
  return { footer, input, dismiss, clicked };
};

const pointer = (element: EventTarget, type: string, pointerId = 1, clientX = 24) =>
  element.dispatchEvent(
    Object.assign(new Event(type, { bubbles: true, cancelable: true }), { pointerId, isPrimary: true, button: 0, clientX, clientY: 24 }),
  );

test('WebKit blur and a delayed compatibility click still dismiss exactly once', () => {
  const { footer, input, dismiss, clicked } = setup();
  pointer(dismiss, 'pointerdown');
  input.blur();
  expect(footer.classList.contains('ios-theme-searchable-editing')).toBe(true);
  pointer(dismiss, 'pointerup');
  expect(clicked).toHaveBeenCalledTimes(1);
  expect(footer.classList.contains('ios-theme-searchable-editing')).toBe(false);
  dismiss.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(clicked).toHaveBeenCalledTimes(1);
});

test.each(['pointercancel', 'pointerup'])('abandoned dismissal clears editing after %s outside the button', (ending) => {
  const { footer, input, dismiss, clicked } = setup();
  pointer(dismiss, 'pointerdown');
  input.blur();
  pointer(document, ending, 2);
  expect(footer.classList.contains('ios-theme-searchable-editing')).toBe(true);
  pointer(document, ending, 1, 80);
  expect(footer.classList.contains('ios-theme-searchable-editing')).toBe(false);
  expect(clicked).not.toHaveBeenCalled();
  input.focus();
  expect(footer.classList.contains('ios-theme-searchable-editing')).toBe(true);
  input.blur();
  expect(footer.classList.contains('ios-theme-searchable-editing')).toBe(false);
});

test('keyboard focus can move to dismissal and activate the original action', () => {
  const { footer, input, dismiss, clicked } = setup();
  dismiss.tabIndex = 0;
  dismiss.focus();
  expect(footer.classList.contains('ios-theme-searchable-editing')).toBe(true);
  dismiss.click();
  expect(clicked).toHaveBeenCalledTimes(1);
  input.focus();
  input.blur();
  expect(footer.classList.contains('ios-theme-searchable-editing')).toBe(false);
});

test('window blur cancels the pointer without dismissing or leaving editing stuck', () => {
  const { footer, input, dismiss, clicked } = setup();
  pointer(dismiss, 'pointerdown');
  input.blur();
  window.dispatchEvent(new Event('blur'));
  pointer(document, 'pointerup');
  expect(footer.classList.contains('ios-theme-searchable-editing')).toBe(false);
  expect(clicked).not.toHaveBeenCalled();
});

const hydrateClear = (footer: HTMLElement) => {
  const clear = document.createElement('button');
  clear.className = 'searchbar-clear-button';
  clear.innerHTML = '<ion-icon></ion-icon>';
  clear.getBoundingClientRect = () => ({ left: 0, top: 0, right: 48, bottom: 48, width: 48, height: 48 }) as DOMRect;
  footer.querySelector('ion-searchbar')!.append(clear);
  return clear;
};

test('a clear button hydrated after setup keeps its Ionic click action and suppresses the later pointer click', () => {
  const { footer, input, clicked } = setup();
  const clear = hydrateClear(footer);
  const cleared = vi.fn(() => {
    input.value = '';
  });
  clear.addEventListener('click', cleared);
  input.value = 'Query';
  pointer(clear.firstElementChild!, 'pointerdown');
  input.blur();
  expect(footer.classList.contains('ios-theme-searchable-editing')).toBe(true);
  pointer(clear.firstElementChild!, 'pointerup');
  expect(cleared).toHaveBeenCalledTimes(1);
  expect(input.value).toBe('');
  clear.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(cleared).toHaveBeenCalledTimes(1);
  expect(clicked).not.toHaveBeenCalled();
  // Keyboard, accessibility, and native projection invoke the same existing click handler.
  input.value = 'Next';
  clear.click();
  expect(cleared).toHaveBeenCalledTimes(2);
  expect(input.value).toBe('');
});

test.each(['pointercancel', 'pointerup'])('abandoned clear does not invoke Ionic after %s outside its target', (ending) => {
  const { footer, input } = setup();
  const clear = hydrateClear(footer);
  const cleared = vi.fn();
  clear.addEventListener('click', cleared);
  pointer(clear, 'pointerdown');
  input.blur();
  pointer(document, ending, 1, 80);
  expect(cleared).not.toHaveBeenCalled();
  expect(footer.classList.contains('ios-theme-searchable-editing')).toBe(false);
});
