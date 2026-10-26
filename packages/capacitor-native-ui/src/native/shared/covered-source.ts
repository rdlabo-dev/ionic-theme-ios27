import { createWebProjectionScope, type WebProjectionScope } from '@rdlabo/capacitor-native-ui-kit';

const scopes = new WeakMap<Document, WebProjectionScope>();
export const getProjectionScope = (doc: Document): WebProjectionScope => {
  let scope = scopes.get(doc);
  if (!scope) {
    scope = createWebProjectionScope(doc, 'native-ui');
    const isProjectionMutation = scope.isProjectionMutation;
    const { imageMarker } = scope;
    scope.isProjectionMutation = (record) => {
      if (isProjectionMutation(record)) return true;
      // Ionic clones/proxies copy presentation state without changing the source.
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      return !!target?.closest(`:is(.ion-cloned-element, [data-native-ui-proxy])[${imageMarker}]`);
    };
    scopes.set(doc, scope);
  }
  return scope;
};
