import { fitsClip } from './shared/clipping';
export { projectionAncestors as extensionAncestors } from './shared/clipping';
import type { Candidate, Identify } from './shared/candidate';
import { frame, isDark, visible } from './shared/dom';
import { iconSource, type createIconRenderer } from './shared/icons';

export type NativeUIValue = string | number | boolean | null | NativeUIValue[] | { [key: string]: NativeUIValue };

/** Opaque image reference. Return it in props; the shell replaces it with NativeUIImage data before transmission. */
export type NativeUIImageReference = { readonly $nativeUIImage: string };
type NativeUIImage = { data: string; width: number; height: number; template: boolean };

export interface NativeUIReadContext {
  /** Capture a local SVG or resolved ion-icon using the standard renderer. Unsupported artwork returns null. */
  image(element: SVGElement | HTMLElement | null, options?: { template?: boolean }): NativeUIImageReference | null;
}

/** An app-local DOM projection. Swift or Kotlin registers its native content under the same name. */
export interface NativeUIExtension {
  readonly name: string;
  readonly selector: string;
  /** Defaults to the source element's frame. Unsupported hosts keep the Web source visible. */
  readonly placement?: 'element' | 'tab-accessory';
  /** Return null to keep this instance on the Web. Read current source state without side effects. Notify property-only changes with shell.markForCheck(). */
  readonly read: (
    element: HTMLElement,
    context: NativeUIReadContext,
  ) => {
    props: { [key: string]: NativeUIValue };
    /** Click targets must belong to the source element. Null targets are unavailable. */
    actions?: Record<string, HTMLElement | null>;
  } | null;
}

/** Defines a projection locally; it does not start native work or register a Capacitor plugin. */
export const defineNativeUI = <T extends NativeUIExtension>(extension: T): Readonly<T> => Object.freeze({ ...extension });

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

const json = (value: unknown, images: Map<string, NativeUIImage>): string => {
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
    if (item && typeof item === 'object' && '$nativeUIImage' in item) {
      const image = images.get(item.$nativeUIImage as string);
      if (!image || Object.keys(item).length !== 1) throw new Error('Invalid native image reference');
      return image;
    }
    return item;
  });
  if (!result || result.length > 65536) throw new Error('Native UI props exceed 64K characters');
  return result;
};

/** Follow slot assignment too: Ionic scroll containers live inside shadow roots. */

export const readExtension = (
  element: HTMLElement,
  extensions: readonly NativeUIExtension[],
  id: Identify,
  diagnose: (reason: string) => void = () => {},
): Candidate | undefined => {
  const skip = (reason: string): undefined => {
    diagnose(reason);
    return undefined;
  };
  const matches = extensions.filter((extension) => element.matches(extension.selector));
  if (matches.length !== 1) return skip('overlapping-selectors: exactly one extension must own this source.');
  if (!visible(element)) return skip('source-hidden: the source must be visible and inside the viewport.');
  if (element.closest('ion-modal, ion-popover, ion-menu'))
    return skip('unsupported-overlay: extension sources inside Web overlays stay on the Web.');
  if (element.contains(element.ownerDocument.activeElement)) return skip('source-focused: keep the focused Web source until focus leaves.');
  const extension = matches[0];
  if (extension.placement !== 'tab-accessory' && !fitsClip(element))
    return skip('source-clipped: the source must fit its clipping ancestors without transformed ancestors.');
  try {
    const images: { value: NativeUIImage; source: string }[] = [];
    const imageValues = new Map<string, NativeUIImage>();
    let state: ReturnType<NativeUIExtension['read']>;
    try {
      state = extension.read(element, {
        image(owner, options) {
          if (!owner || !(element.contains(owner) || element.shadowRoot?.contains(owner))) return null;
          const svg = owner.matches('svg') ? (owner as SVGElement) : owner.shadowRoot?.querySelector<SVGElement>('svg');
          if (!svg) return null;
          const source = iconSource(svg);
          const { width, height } = owner.getBoundingClientRect();
          if (!source || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
          const value: NativeUIImage = { data: '', width, height, template: options?.template ?? false };
          const key = String(images.length);
          images.push({ value, source });
          imageValues.set(key, value);
          return { $nativeUIImage: key };
        },
      });
    } catch {
      return skip('reader-error: the extension reader threw; inspect its implementation.');
    }
    if (!state) return skip('reader-opt-out: the reader returned null.');
    const props = json(state.props, imageValues);
    const actions = new Map<string, HTMLElement>();
    const targets: Record<string, string> = {};
    for (const [name, target] of Object.entries(state.actions ?? {})) {
      if (!name || (target && !element.contains(target))) return skip('invalid-actions: use named targets inside the source element.');
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
    if (Object.keys(targets).length > 30) return skip('invalid-actions: a source can expose at most 30 actions.');
    const tabBar =
      extension.placement === 'tab-accessory'
        ? Array.from(element.closest('ion-tabs')?.querySelectorAll<HTMLElement>('ion-tab-bar') ?? []).find(
            (bar) => bar.closest('ion-tabs') === element.closest('ion-tabs'),
          )
        : undefined;
    if (extension.placement === 'tab-accessory' && !tabBar)
      return skip('missing-tab-owner: a tab accessory needs an owning ion-tabs with ion-tab-bar.');
    const style = getComputedStyle(element);
    const control = {
      id: id(element),
      kind: 'extension' as const,
      ...frame(element.getBoundingClientRect()),
      items: [],
      dark: isDark(style),
      rtl: style.direction === 'rtl',
      extension: { name: extension.name, props, actions: targets, tabBarId: tabBar ? id(tabBar) : undefined },
    };
    return {
      element,
      actions,
      icons: [],
      control,
      assets: images.length
        ? {
            signature: JSON.stringify(images),
            async render(renderer: ReturnType<typeof createIconRenderer>) {
              for (const { value, source } of images) value.data = await renderer.render(source, value.width, value.height);
              control.extension.props = json(state.props, imageValues);
            },
          }
        : undefined,
    };
  } catch {
    // Keep the source usable without exposing props or application exception data.
    return skip('invalid-props: return a JSON object with finite values, valid image references, and at most 64K characters.');
  }
};
