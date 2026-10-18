import { fitsClip } from './shared/clipping';
export { projectionAncestors as extensionAncestors } from './shared/clipping';
import type { Candidate, Identify } from './shared/candidate';
import { frame, isDark, visible } from './shared/dom';

export type NativeUIValue = string | number | boolean | null | NativeUIValue[] | { [key: string]: NativeUIValue };

/** An app-local DOM projection. Swift registers its View under the same name. */
export interface NativeUIExtension {
  readonly name: string;
  readonly selector: string;
  /** Defaults to the source element's frame. Unsupported hosts keep the Web source visible. */
  readonly placement?: 'element' | 'tab-accessory';
  /** Return null to keep this instance on the Web. Read only DOM-backed state. */
  readonly read: (element: HTMLElement) => {
    props: { [key: string]: NativeUIValue };
    /** Click targets must belong to the source element. Null targets are unavailable. */
    actions?: Record<string, HTMLElement | null>;
  } | null;
}

/** Defines a projection locally; it does not start native work or register a Capacitor plugin. */
export const defineNativeUI = (extension: NativeUIExtension): NativeUIExtension => Object.freeze({ ...extension });

export const validateExtensions = (extensions: readonly NativeUIExtension[], doc: Document): void => {
  const names = new Set<string>();
  for (const extension of extensions) {
    if (!extension.name.trim() || names.has(extension.name)) throw new Error('Native UI extension names must be nonempty and unique');
    names.add(extension.name);
    if (!extension.selector.trim()) throw new Error('Native UI extensions require a selector');
    doc.querySelector(extension.selector);
    if (extension.placement && !['element', 'tab-accessory'].includes(extension.placement)) throw new Error('Invalid native UI placement');
  }
};

const json = (value: unknown): string => {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype)
    throw new Error('Native UI props must be a JSON object');
  const result = JSON.stringify(value, (_key, item: unknown) => {
    if (
      item === undefined ||
      typeof item === 'function' ||
      typeof item === 'symbol' ||
      (typeof item === 'number' && !Number.isFinite(item)) ||
      (item !== null && typeof item === 'object' && !Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype)
    )
      throw new Error('Native UI props must contain only JSON values');
    return item;
  });
  if (!result || result.length > 65536) throw new Error('Native UI props exceed 64K characters');
  return result;
};

/** Follow slot assignment too: Ionic scroll containers live inside shadow roots. */

export const readExtension = (element: HTMLElement, extensions: readonly NativeUIExtension[], id: Identify): Candidate | undefined => {
  const matches = extensions.filter((extension) => element.matches(extension.selector));
  if (
    matches.length !== 1 ||
    !visible(element) ||
    element.closest('ion-modal, ion-popover, ion-menu') ||
    element.contains(element.ownerDocument.activeElement)
  )
    return;
  const extension = matches[0];
  if (extension.placement !== 'tab-accessory' && !fitsClip(element)) return;
  try {
    const state = extension.read(element);
    if (!state) return;
    const props = json(state.props);
    const actions = new Map<string, HTMLElement>();
    const targets: Record<string, string> = {};
    for (const [name, target] of Object.entries(state.actions ?? {})) {
      if (!name || (target && !element.contains(target))) return;
      if (
        !target ||
        !visible(target) ||
        (target as HTMLElement & { disabled?: boolean }).disabled ||
        target.matches(':disabled, [disabled]') ||
        target.closest('[aria-disabled="true"]') ||
        getComputedStyle(target).pointerEvents === 'none'
      )
        continue;
      targets[name] = id(target);
      actions.set(id(target), target);
    }
    if (Object.keys(targets).length > 30) return;
    const tabBar =
      extension.placement === 'tab-accessory'
        ? Array.from(element.closest('ion-tabs')?.querySelectorAll<HTMLElement>('ion-tab-bar') ?? []).find(
            (bar) => bar.closest('ion-tabs') === element.closest('ion-tabs'),
          )
        : undefined;
    if (extension.placement === 'tab-accessory' && !tabBar) return;
    const style = getComputedStyle(element);
    return {
      element,
      actions,
      icons: [],
      control: {
        id: id(element),
        kind: 'extension',
        ...frame(element.getBoundingClientRect()),
        items: [],
        dark: isDark(style),
        rtl: style.direction === 'rtl',
        extension: { name: extension.name, props, actions: targets, tabBarId: tabBar ? id(tabBar) : undefined },
      },
    };
  } catch {
    // A broken app reader must not retire otherwise valid built-in controls.
    return;
  }
};
