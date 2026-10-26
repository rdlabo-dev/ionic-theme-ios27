import { Capacitor } from '@capacitor/core';
import { createSnapshotHandoff } from '@rdlabo/capacitor-native-ui-kit';
import type { NativeUIPlugin } from '../definitions';
import { snapshotScope, snapshotTargets } from './covered-source';

/** Ionic decides surface ownership; the kit owns pixels, timing and restoration. */
export const createCoveredSnapshots = (
  doc: Document,
  plugin: NativeUIPlugin,
  listen: NativeUIPlugin['addListener'],
  callbacks: { wake: () => void; blocked: () => boolean; modal?: () => HTMLIonModalElement | undefined; revision?: () => number },
) =>
  createSnapshotHandoff(
    doc,
    {
      send: (request) => plugin.coveredSnapshot!(request),
      listen: (listener) => listen('snapshotInteraction', listener),
      resolveURL: (url) => Capacitor.convertFileSrc(url),
    },
    snapshotScope,
    {
      wake: () => callbacks.wake(),
      blocked: () => callbacks.blocked(),
      revision: callbacks.revision ? () => callbacks.revision!() : undefined,
      transient: !!callbacks.modal,
      eligible: (source) =>
        callbacks.modal
          ? !!callbacks.modal() && source.element.closest('ion-modal') === callbacks.modal() && source.control.placement === 'vertical-bars'
          : !source.element.closest('ion-modal'),
      target: (source, placement) => {
        const projection = snapshotTargets.get(source);
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
export type CoveredSnapshots = Awaited<ReturnType<typeof createCoveredSnapshots>>;
