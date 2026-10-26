import { Capacitor } from '@capacitor/core';
import { createWebProjection } from '@rdlabo/capacitor-native-ui-kit';
import type { NativeUIPlugin } from '../definitions';
import { projectionScope } from './covered-source';

/** Ionic decides surface ownership; the kit owns pixels, timing and restoration. */
export const createCoveredSnapshots = async (
  doc: Document,
  plugin: NativeUIPlugin,
  listen: NativeUIPlugin['addListener'],
  callbacks: { wake: () => void; blocked: () => boolean; modal?: () => HTMLIonModalElement | undefined; revision?: () => number },
) => {
  let layer: HTMLElement | undefined;
  let selectedLayer: HTMLElement | undefined;
  const projection = await createWebProjection(
    doc,
    {
      send: (request) => plugin.coveredSnapshot!(request),
      listen: (listener) => listen('snapshotInteraction', listener),
      resolveURL: (url) => Capacitor.convertFileSrc(url),
    },
    projectionScope,
    {
      wake: () => callbacks.wake(),
      blocked: () => callbacks.blocked(),
      revision: callbacks.revision ? () => callbacks.revision!() : undefined,
      transient: !!callbacks.modal,
      layer: () => selectedLayer,
      eligible: (source) =>
        callbacks.modal
          ? !!callbacks.modal() && source.element.closest('ion-modal') === callbacks.modal() && source.control.placement === 'vertical-bars'
          : !source.element.closest('ion-modal'),
      target: (source, placement) => {
        const projection = projectionScope.getTarget(source);
        // Only rail images use a display proxy; element images stay on their source.
        const rail = placement === 'vertical-bars';
        return rail && (projection || source.matches('ion-button, ion-buttons, ion-back-button, ion-menu-button'))
          ? projection?.isConnected
            ? projection
            : undefined
          : source;
      },
      current: (sources) => !callbacks.modal || sources.every((source) => source.closest('ion-modal') === callbacks.modal!()),
    },
  );
  const begin = projection.begin;
  const beginOnSurface = (surface?: HTMLElement) => {
    if (surface && !surface.isConnected) return;
    if (surface && !projection.token) {
      layer ??= doc.createElement('div');
      layer.setAttribute('data-native-ui-projection-host', '');
      layer.setAttribute('aria-hidden', 'true');
      layer.inert = true;
      // Ionic's presenting page owns the animation and stacking context.
      layer.style.cssText = 'position:absolute;inset:0;overflow:visible;pointer-events:none;z-index:1001';
      if (layer.parentElement !== surface) surface.append(layer);
    }
    selectedLayer = surface ? layer : undefined;
    begin();
  };
  const destroy = projection.destroy;
  projection.destroy = async () => {
    await destroy();
    layer?.remove();
    layer = undefined;
  };
  return Object.assign(projection, { begin: beginOnSurface });
};
export type CoveredSnapshots = Awaited<ReturnType<typeof createCoveredSnapshots>>;
