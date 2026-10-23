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
  return Array.from(page.querySelectorAll<HTMLElement>('ion-button, ion-back-button, ion-menu-button')).map((element) => {
    const id = `source-${++sequence}`;
    return {
      element,
      control: {
        id,
        kind: element.matches('ion-back-button') ? 'back-button' : element.matches('ion-menu-button') ? 'menu-button' : 'button',
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

test('start children follow their surface and explicit children can follow an action across groups', () => {
  const grouped = mount(
    toolbar('<ion-buttons slot="start"><ion-button>A</ion-button><ion-button data-transition-id="b">B</ion-button></ion-buttons>'),
  );
  const group: Candidate = {
    ...grouped[0],
    element: grouped[0].element.parentElement!,
    control: { ...grouped[0].control, kind: 'button-group', items: grouped.flatMap((candidate) => candidate.control.items) },
    actions: new Map(grouped.flatMap((candidate) => [...candidate.actions])),
  };
  assignToolbarTransitionIds([group]);
  const separate = resolve(
    toolbar('<ion-button slot="start">A</ion-button><ion-button slot="start" data-transition-id="b">B</ion-button>'),
  );
  expect(group.control.items.map((item) => item.transitionId)).toEqual(ids(separate));
});

test.each([undefined, 'vertical-bars'] as const)('Menu and Back share start position and keep distinct actions: %s', (placement) => {
  const from = mount(toolbar('<ion-buttons slot="start"><ion-menu-button></ion-menu-button></ion-buttons>'));
  const to = mount(toolbar('<ion-buttons slot="start"><ion-back-button></ion-back-button></ion-buttons>'));
  for (const candidates of [from, to]) {
    candidates.forEach((candidate) => {
      candidate.control.placement = placement;
    });
    assignToolbarTransitionIds(candidates);
  }
  expect(ids(from)).toEqual(ids(to));
  expect(from[0].control.transitionId).toBe(to[0].control.transitionId);
  expect(from[0].control.items[0].id).not.toBe(to[0].control.items[0].id);
});

test('horizontal surface signatures follow explicit item IDs across positions', () => {
  const from = mount(toolbar('<ion-button data-transition-id="a">A</ion-button><ion-button data-transition-id="b">B</ion-button>'));
  const to = mount(toolbar('<ion-button data-transition-id="b">B</ion-button><ion-button data-transition-id="a">A</ion-button>'));
  for (const candidates of [from, to]) {
    candidates.forEach(({ control }) => {
      control.placement = undefined;
    });
    assignToolbarTransitionIds(candidates);
  }
  expect(from.map(({ control }) => control.transitionId)).toEqual(to.map(({ control }) => control.transitionId).reverse());
  const group = (items: Candidate[]): Candidate => ({
    ...items[0],
    element: items[0].element.parentElement!,
    control: { ...items[0].control, kind: 'button-group', items: items.flatMap(({ control }) => control.items) },
    actions: new Map(items.flatMap(({ actions }) => [...actions])),
  });
  const sourceGroup = group(from);
  const fullTarget = group(to);
  [sourceGroup, fullTarget].forEach((candidate) => assignToolbarTransitionIds([candidate]));
  expect(sourceGroup.control.transitionId).toBe(fullTarget.control.transitionId);
});

test.each([undefined, 'vertical-bars'] as const)('surface and child identities survive group resizing: %s', (placement) => {
  const children = mount(toolbar('<ion-buttons slot="end"><ion-button>A</ion-button><ion-button>B</ion-button></ion-buttons>'));
  const group: Candidate = {
    ...children[0],
    element: children[0].element.parentElement!,
    control: { ...children[0].control, kind: 'button-group', items: children.flatMap(({ control }) => control.items) },
    actions: new Map(children.flatMap((candidate) => [...candidate.actions])),
  };
  const targets = mount(toolbar('<ion-buttons slot="end"><ion-button>Cancel</ion-button><ion-button>Save</ion-button></ion-buttons>'));
  [group, ...targets].forEach(({ control }) => {
    control.placement = placement;
  });
  targets[0].control.items[0].buttonFill = 'clear';
  assignToolbarTransitionIds([group]);
  assignToolbarTransitionIds(targets);
  expect(group.control.transitionId).toBe(targets[1].control.transitionId);
  expect(group.control.transitionId).not.toBe(targets[0].control.transitionId);
  expect(group.control.items[1].transitionId).toBe(targets[1].control.items[0].transitionId);
  // Adding or removing a group child never renumbers the following surface.
  const following = targets[1];
  const before = following.control.transitionId;
  const childBefore = following.control.items[0].transitionId;
  group.element.parentElement!.append(following.element);
  assignToolbarTransitionIds([group, following]);
  expect(following.control.transitionId).toBe(before);
  expect(following.control.items[0].transitionId).toBe(childBefore);
  expect(group.control.items[1].transitionId).not.toBe(childBefore);
  group.control.items.pop();
  assignToolbarTransitionIds([group, following]);
  expect(following.control.items[0].transitionId).toBe(childBefore);
});

test('changing the toolbar axis preserves surface and item identities including explicit overrides', () => {
  const candidates = mount(
    toolbar(
      '<ion-buttons slot="start"><ion-menu-button></ion-menu-button></ion-buttons><ion-button data-transition-id="edit">Edit</ion-button>',
    ),
  );
  assignToolbarTransitionIds(candidates);
  const before = candidates.map(({ control }) => [control.transitionId, control.items[0].transitionId]);
  candidates.forEach(({ control }) => {
    delete control.placement;
  });
  assignToolbarTransitionIds(candidates);
  expect(candidates.map(({ control }) => [control.transitionId, control.items[0].transitionId])).toEqual(before);
});

test.each(['ion-button', 'ion-menu-button'])('a surviving explicit %s keeps its group identity when siblings are removed', (tag) => {
  const children = mount(
    toolbar(`<ion-buttons slot="end"><${tag} data-transition-id="a">A</${tag}><ion-button>B</ion-button></ion-buttons>`),
  );
  const group: Candidate = {
    ...children[0],
    element: children[0].element.parentElement!,
    control: { ...children[0].control, kind: 'button-group', items: children.flatMap(({ control }) => control.items) },
    actions: new Map(children.flatMap(({ actions }) => [...actions])),
  };
  for (const explicitGroup of [false, true]) {
    if (explicitGroup) group.element.setAttribute('data-transition-id', 'group');
    group.control.items = children.flatMap(({ control }) => control.items);
    group.control.kind = 'button-group';
    assignToolbarTransitionIds([group]);
    const before = [group.control.transitionId, group.control.items[0].transitionId];
    group.control.items = [children[0].control.items[0]];
    // The reader represents a remaining menu as menu-button, still owned by ion-buttons.
    if (tag === 'ion-menu-button') group.control.kind = 'menu-button';
    assignToolbarTransitionIds([group]);
    expect([group.control.transitionId, group.control.items[0].transitionId]).toEqual(before);
    expect(group.actions.get(group.control.items[0].id)).toBe(children[0].element);
  }
});

test.each(['ltr', 'rtl'] as const)('automatic positions count from each logical outer edge in %s', (direction) => {
  const from = mount(toolbar('<ion-button slot="start">Menu</ion-button><ion-button slot="end">Save</ion-button>'));
  const to = mount(
    toolbar(
      '<ion-button slot="start">Back</ion-button><ion-button slot="start">Added</ion-button><ion-button slot="end">Cancel</ion-button><ion-button slot="end">Done</ion-button>',
    ),
  );
  for (const candidates of [from, to]) {
    candidates[0].element.closest<HTMLElement>('.ion-page')!.dir = direction;
    candidates.forEach(({ control }) => {
      control.rtl = direction === 'rtl';
    });
    assignToolbarTransitionIds(candidates);
  }
  expect(from[0].control.transitionId).toBe(to[0].control.transitionId);
  expect(from[1].control.transitionId).toBe(to[3].control.transitionId);
  expect(ids(from)).toEqual([ids(to)[0], ids(to)[3]]);
  expect(from[1].control.transitionId).not.toBe(to[2].control.transitionId);
});

test.each(['ltr', 'rtl'] as const)('an end group associates its outer child with Save in %s', (direction) => {
  const children = mount(toolbar('<ion-buttons slot="end"><ion-button>GitHub</ion-button><ion-button>Ionic</ion-button></ion-buttons>'));
  const group: Candidate = {
    ...children[0],
    element: children[0].element.parentElement!,
    control: { ...children[0].control, kind: 'button-group', items: children.flatMap(({ control }) => control.items) },
    actions: new Map(children.flatMap(({ actions }) => [...actions])),
  };
  const targets = mount(toolbar('<ion-buttons slot="end"><ion-button>Cancel</ion-button><ion-button>Save</ion-button></ion-buttons>'));
  for (const candidates of [[group], targets]) {
    candidates[0].element.closest<HTMLElement>('.ion-page')!.dir = direction;
    candidates.forEach(({ control }) => {
      control.rtl = direction === 'rtl';
    });
    assignToolbarTransitionIds(candidates);
  }
  expect(group.control.transitionId).toBe(targets[1].control.transitionId);
  expect(group.control.items[1].transitionId).toBe(targets[1].control.items[0].transitionId);
  expect(group.control.items[0].transitionId).not.toBe(targets[1].control.items[0].transitionId);
  expect(targets[1].actions.get(targets[1].control.items[0].id)).toBe(targets[1].element);
});
