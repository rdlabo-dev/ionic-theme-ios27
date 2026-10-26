import {
  createWebProjectionBatch,
  createWebProjectionScope,
  type WebProjectionScope,
  type WebProjectionSource,
} from '@rdlabo/capacitor-native-ui-engine';
import type { NativeUIPlugin } from '../definitions';
import { getProjectionState } from './covered-source';

/** Ionic owns fallback placement; all controls on a surface share one Native transaction. */
export const createCoveredSnapshots = async (
  doc: Document,
  plugin: NativeUIPlugin,
  listen: NativeUIPlugin['addListener'],
  callbacks: { wake: () => void; blocked: () => boolean; modal?: () => HTMLIonModalElement | undefined; revision?: () => number },
) => {
  const state = getProjectionState(doc);
  const scopes = new WeakMap<HTMLElement, WebProjectionScope>();
  const fallbackScope = (source: HTMLElement, placement?: string) => {
    const proxy = state.getTarget(source);
    const rail = placement === 'vertical-bars';
    const target = rail && (proxy || source.matches('ion-button, ion-buttons, ion-back-button, ion-menu-button')) ? proxy : source;
    if (!target?.isConnected || target.ownerDocument !== doc) return;
    let scope = scopes.get(target);
    if (!scope) {
      scope = createWebProjectionScope(target, 'native-ui');
      scopes.set(target, scope);
    }
    return scope;
  };
  const moved = new Map<HTMLElement, { parent: Node; next: ChildNode | null; surface: HTMLElement }>();
  const restorePlacement = () => {
    for (const [element, saved] of [...moved].reverse()) {
      if (element.parentNode === saved.surface && saved.parent.isConnected)
        saved.parent.insertBefore(element, saved.next?.parentNode === saved.parent ? saved.next : null);
    }
    moved.clear();
  };
  const projection = await createWebProjectionBatch(
    {
      send: (request) => plugin.coveredSnapshot!(request),
      listen: (listener) => listen('snapshotInteraction', listener),
    },
    {
      wake: () => {
        if (!projection.token && !projection.restoring) restorePlacement();
        callbacks.wake();
      },
      blocked: () => callbacks.blocked(),
      revision: callbacks.revision ? () => callbacks.revision!() : undefined,
      transient: !!callbacks.modal,
      eligible: (source) =>
        callbacks.modal
          ? !!callbacks.modal() && source.element.closest('ion-modal') === callbacks.modal() && source.control.placement === 'vertical-bars'
          : !source.element.closest('ion-modal'),
      current: (sources) => !callbacks.modal || sources.every((source) => source.closest('ion-modal') === callbacks.modal!()),
    },
  );
  const unregister = state.register(projection);
  let latest: WebProjectionSource[] = [];
  const consider = projection.consider;
  const begin = projection.begin;
  const updated = projection.updated;
  const invalidate = projection.invalidate;
  const destroy = projection.destroy;
  return Object.assign(projection, {
    consider(revision: number, sources: WebProjectionSource[]) {
      latest = sources;
      consider(
        revision,
        sources.flatMap((source) => {
          const scope = fallbackScope(source.element, source.control.placement);
          return scope ? [{ ...source, scope }] : [];
        }),
      );
    },
    begin(surface?: HTMLElement) {
      if (surface && !surface.isConnected) return;
      if (surface && !projection.token) {
        for (const source of latest) {
          if (!projection.preparedOwners.includes(source.element)) continue;
          const target = state.getTarget(source.element);
          // Move only Ionic-owned fallback proxies. Source controls are application-owned.
          if (!target?.parentNode || surface.contains(target) || !target.matches('.ion-cloned-element, [data-native-ui-proxy]')) continue;
          if (!moved.has(target)) moved.set(target, { parent: target.parentNode, next: target.nextSibling, surface });
          surface.append(target);
        }
      }
      begin();
      if (!projection.token) restorePlacement();
    },
    updated(token: string | undefined, ids?: string[], revision?: number) {
      updated(token, ids, revision);
      if (!projection.restoring && !projection.token) restorePlacement();
    },
    invalidate() {
      invalidate();
      restorePlacement();
    },
    async destroy() {
      await destroy();
      restorePlacement();
      unregister();
    },
  });
};
export type CoveredSnapshots = Awaited<ReturnType<typeof createCoveredSnapshots>>;
