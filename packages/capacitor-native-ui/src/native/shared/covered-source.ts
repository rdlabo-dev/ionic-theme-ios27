import type { WebProjectionBatch } from '@webview-native-ui/engine';

/** Ionic's cross-surface ownership and source/proxy mapping, not a projection DOM scope. */
const states = new WeakMap<Document, NativeUIProjectionState>();
const createState = () => {
  const managers = new Set<WebProjectionBatch>();
  const nativeOwners = new Set<(source: HTMLElement) => boolean>();
  const targets = new WeakMap<HTMLElement, HTMLElement>();
  const imageMarker = 'data-native-ui-snapshot';
  const collect = (key: 'owners' | 'visibleOwners' | 'preparedOwners') => [...new Set([...managers].flatMap((manager) => manager[key]))];
  return {
    imageMarker,
    nativeOwns: (source: HTMLElement) => [...nativeOwners].some((owns) => owns(source)),
    registerNativeOwner(owns: (source: HTMLElement) => boolean) {
      nativeOwners.add(owns);
      return () => nativeOwners.delete(owns);
    },
    get snapshotsEnabled() {
      return managers.size > 0;
    },
    sourcesChangedEvent: 'native-ui:sources-change',
    targetsChangedEvent: 'native-ui:targets-change',
    register(manager: WebProjectionBatch) {
      managers.add(manager);
      return () => managers.delete(manager);
    },
    get owners(): readonly HTMLElement[] {
      return collect('owners');
    },
    get visibleOwners(): readonly HTMLElement[] {
      return collect('visibleOwners');
    },
    get preparedOwners(): readonly HTMLElement[] {
      return collect('preparedOwners');
    },
    owns: (element: HTMLElement) => collect('owners').some((owner) => owner === element || owner.contains(element)),
    isVisible: (element: HTMLElement) => collect('visibleOwners').some((owner) => owner === element || owner.contains(element)),
    getTarget: (source: HTMLElement) => targets.get(source),
    setTarget: (source: HTMLElement, target: HTMLElement) => {
      targets.set(source, target);
    },
    deleteTarget: (source: HTMLElement) => targets.delete(source),
    isProjectionMutation(record: MutationRecord) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      if (target?.closest('[data-native-ui-projection-node]')) return true;
      if (target?.closest('.ion-cloned-element, [data-native-ui-proxy]')) return true;
      if (
        record.type === 'attributes' &&
        [
          imageMarker,
          'data-native-ui-proxy-prepared',
          'data-native-ui-snapshot-prepared',
          'data-native-ui-snapshot-source',
          'data-native-ui-snapshot-visible',
          'data-native-ui-snapshot-content',
          'data-native-ui-snapshot-positioned',
        ].includes(record.attributeName ?? '')
      )
        return true;
      const image = (node: Node) =>
        node instanceof Element &&
        node.matches(
          `style[${imageMarker}], style[data-native-ui-snapshot-base], [data-native-ui-proxy-prepared], [data-native-ui-snapshot-prepared], [data-native-ui-projection-node]`,
        );
      const nodes = [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)];
      return image(record.target) || (record.type === 'childList' && nodes.length > 0 && nodes.every(image));
    },
  };
};
export type NativeUIProjectionState = ReturnType<typeof createState>;
export const getProjectionState = (doc: Document): NativeUIProjectionState => {
  let state = states.get(doc);
  if (!state) {
    state = createState();
    states.set(doc, state);
  }
  return state;
};
