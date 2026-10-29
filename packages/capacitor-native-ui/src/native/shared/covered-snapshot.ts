import { createWebProjectionSurface } from '@webview-native-ui/engine';
import type { NativeUIPlugin } from '../definitions';
import { getProjectionState } from './covered-source';

/** Ionic supplies source ownership and proxy placement; Engine owns image handoff. */
export const createCoveredSnapshots = async (
  doc: Document,
  plugin: NativeUIPlugin,
  listen: NativeUIPlugin['addListener'],
  callbacks: { wake: () => void; blocked: () => boolean; modal?: HTMLIonModalElement; revision?: () => number },
) => {
  const state = getProjectionState(doc);
  const { modal, wake, blocked, revision } = callbacks;
  const projection = await createWebProjectionSurface(
    {
      send: (request) => plugin.coveredSnapshot!(request),
      listen: (listener) => listen('snapshotInteraction', listener),
    },
    {
      namespace: 'native-ui',
      target: ({ element: source, control }) => {
        const proxy = state.getTarget(source);
        return control.placement === 'vertical-bars' &&
          (proxy || source.matches('ion-button, ion-buttons, ion-back-button, ion-menu-button'))
          ? proxy
          : source;
      },
      canRelocate: (target) => target.matches('.ion-cloned-element, [data-native-ui-proxy]'),
      wake,
      blocked,
      revision,
      transient: !!modal,
      eligible: (source) =>
        modal
          ? source.element.closest('ion-modal') === modal && source.control.placement === 'vertical-bars'
          : !source.element.closest('ion-modal'),
      current: (sources) => !modal || sources.every((source) => source.closest('ion-modal') === modal),
    },
  );
  const unregister = state.register(projection);
  const destroy = projection.destroy;
  return Object.assign(projection, {
    async destroy() {
      try {
        await destroy();
      } finally {
        unregister();
      }
    },
  });
};
export type CoveredSnapshots = Awaited<ReturnType<typeof createCoveredSnapshots>>;
