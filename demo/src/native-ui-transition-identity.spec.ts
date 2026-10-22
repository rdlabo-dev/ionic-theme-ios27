import { afterEach, expect, test } from 'vitest';
import { assignToolbarTransitionIds } from '../../packages/capacitor-native-ui/src/native/shared/transition-identity';
import type { Candidate } from '../../packages/capacitor-native-ui/src/native/shared/candidate';
import type { NativeUIItem } from '../../packages/capacitor-native-ui/src/native/definitions';

let sequence = 0;
const mount = (markup: string): Candidate[] => {
  const page = document.createElement('section');
  page.className = 'ion-page';
  page.innerHTML = markup;
  document.body.append(page);
  return Array.from(page.querySelectorAll<HTMLElement>('ion-button, ion-back-button')).map((element) => {
    const id = `source-${++sequence}`;
    return {
      element,
      control: {
        id,
        kind: element.matches('ion-back-button') ? 'back-button' : 'button',
        placement: 'vertical-bars',
        x: 0,
        y: 0,
        width: 44,
        height: 44,
        dark: false,
        rtl: false,
        items: [{ id, label: element.textContent } as NativeUIItem],
      },
      actions: new Map([[id, element]]),
      icons: [],
    };
  });
};
const toolbar = (content: string) => `<ion-header><ion-toolbar>${content}</ion-toolbar></ion-header>`;
const ids = (candidates: Candidate[]) => candidates.map((candidate) => candidate.control.items[0].transitionId);
const resolve = (markup: string) => {
  const candidates = mount(markup);
  assignToolbarTransitionIds(candidates);
  return candidates;
};
afterEach(() => document.body.replaceChildren());

test('ordinary toolbar buttons correspond by position when labels and actions change', () => {
  const from = resolve(toolbar('<ion-button>Edit</ion-button><ion-button>Delete</ion-button>'));
  const to = resolve(toolbar('<ion-button>Done</ion-button><ion-button>Save</ion-button>'));
  expect(ids(from)).toEqual(ids(to));
  expect(from[0].control.transitionId).toBe(to[0].control.transitionId);
  expect(from[0].control.items[0].id).not.toBe(to[0].control.items[0].id);
  expect(to[0].actions.get(to[0].control.items[0].id)).toBe(to[0].element);
  expect(to[0].actions.has(ids(to)[0]!)).toBe(false);
});

test('optional explicit keys follow the intended item through a reorder', () => {
  const from = resolve(toolbar('<ion-button data-transition-id="a">A</ion-button><ion-button data-transition-id="b">B</ion-button>'));
  const to = resolve(toolbar('<ion-button data-transition-id="b">B</ion-button><ion-button data-transition-id="a">A</ion-button>'));
  expect(ids(from)).toEqual(ids(to).reverse());
});

test('adding an explicit override does not renumber automatic neighbours; blank means automatic', () => {
  const from = resolve(toolbar('<ion-button>A</ion-button><ion-button>B</ion-button>'));
  const to = resolve(toolbar('<ion-button data-transition-id="a">A</ion-button><ion-button data-transition-id="  ">B</ion-button>'));
  expect(ids(from)[1]).toBe(ids(to)[1]);
  expect(ids(from)[0]).not.toBe(ids(to)[0]);
});

test('back role is stable and does not shift normal buttons or their groups', () => {
  const from = resolve(toolbar('<ion-buttons slot="start"><ion-back-button></ion-back-button></ion-buttons><ion-button>Edit</ion-button>'));
  const to = resolve(toolbar('<ion-back-button></ion-back-button><ion-button>Done</ion-button>'));
  const root = resolve(toolbar('<ion-button>Root action</ion-button>'));
  expect(ids(from)).toEqual(ids(to));
  expect(ids(root)[0]).toBe(ids(to)[1]);
  expect(root[0].control.transitionId).toBe(to[1].control.transitionId);
});

test('slots, header/footer and multiple toolbars have independent automatic positions', () => {
  const candidates = resolve(
    toolbar('<ion-button slot="start">A</ion-button><ion-button slot="end">B</ion-button>') +
      toolbar('<ion-button>C</ion-button>') +
      '<ion-footer><ion-toolbar><ion-button>D</ion-button></ion-toolbar></ion-footer>',
  );
  expect(new Set(ids(candidates)).size).toBe(4);
  expect(ids(candidates).every((id) => !id?.includes('unmatched'))).toBe(true);
});

test('duplicate explicit keys never merge items, including across slots', () => {
  const from = resolve(
    toolbar('<ion-button slot="start" data-transition-id="same">A</ion-button><ion-button data-transition-id="same">B</ion-button>'),
  );
  const to = resolve(
    toolbar('<ion-button slot="start" data-transition-id="same">A</ion-button><ion-button data-transition-id="same">B</ion-button>'),
  );
  expect(new Set(ids(from)).size).toBe(2);
  expect(ids(from).every((id) => id?.includes('unmatched'))).toBe(true);
  expect(ids(from)).not.toEqual(ids(to));
});

test('duplicate live page identities fall back to source IDs rather than duplicate SwiftUI keys', () => {
  const candidates = [...mount(toolbar('<ion-button>A</ion-button>')), ...mount(toolbar('<ion-button>B</ion-button>'))];
  assignToolbarTransitionIds(candidates);
  expect(new Set(ids(candidates)).size).toBe(2);
  expect(new Set(candidates.map((candidate) => candidate.control.transitionId)).size).toBe(2);
});

test('grouping does not change item positions; grouped children can each override identity', () => {
  const grouped = mount(toolbar('<ion-buttons><ion-button>A</ion-button><ion-button data-transition-id="b">B</ion-button></ion-buttons>'));
  const group: Candidate = {
    ...grouped[0],
    element: grouped[0].element.parentElement!,
    control: { ...grouped[0].control, kind: 'button-group', items: grouped.flatMap((candidate) => candidate.control.items) },
    actions: new Map(grouped.flatMap((candidate) => [...candidate.actions])),
  };
  assignToolbarTransitionIds([group]);
  const separate = resolve(toolbar('<ion-button>A</ion-button><ion-button data-transition-id="b">B</ion-button>'));
  expect(group.control.items.map((item) => item.transitionId)).toEqual(ids(separate));
});
