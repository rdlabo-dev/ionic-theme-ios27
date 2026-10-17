import { getNativeSearchBindings, type NativeSearchBinding } from '../native-integration';
import { activateProjectedElement, marker, unprojected } from './shared/dom';

export const searchProjectionClass = 'ios-theme-vertical-bars-search-projection';

/** Web counterpart of the system search button above the vertical tabs, or at the rail bottom without visible tabs. */
export const createVerticalBarsWebSearch = (doc: Document, eligible: (element: HTMLElement) => boolean, refresh: () => void) => {
  let binding: NativeSearchBinding | undefined;
  let projection: HTMLIonFabButtonElement | undefined;
  let container: HTMLIonFabElement | undefined;
  const iconObserver = new MutationObserver(refresh);
  let previousAriaHidden: string | null = null;
  const restore = (retire?: (surface: HTMLElement) => void) => {
    iconObserver.disconnect();
    if (container) {
      if (retire) retire(container);
      else container.remove();
    }
    container = undefined;
    projection = undefined;
    if (binding) {
      binding.trigger.removeAttribute(marker);
      if (previousAriaHidden === null) binding.trigger.removeAttribute('aria-hidden');
      else binding.trigger.setAttribute('aria-hidden', previousAriaHidden);
    }
    binding = undefined;
  };
  return {
    restore,
    get surface() {
      return container;
    },
    get source() {
      return binding?.trigger;
    },
    update(root: HTMLElement) {
      const next = unprojected(binding ? [binding.trigger] : [], () =>
        getNativeSearchBindings(doc).find(({ trigger, footer }) => eligible(trigger) && eligible(footer)),
      );
      if (next !== binding || container?.parentElement !== root) restore();
      if (!next) return;
      if (!projection) {
        binding = next;
        previousAriaHidden = next.trigger.getAttribute('aria-hidden');
        projection = next.trigger.cloneNode(true) as HTMLIonFabButtonElement;
        for (const name of ['id', 'slot', marker, 'aria-hidden', 'style']) projection.removeAttribute(name);
        container = doc.createElement('ion-fab');
        container.setAttribute('mode', (next.trigger as HTMLIonFabButtonElement).mode ?? 'ios');
        container.classList.add(searchProjectionClass, 'ion-cloned-element');
        projection.addEventListener(
          'click',
          (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            activateProjectedElement(next.trigger);
          },
          { capture: true },
        );
        container.append(projection);
        root.append(container);
        next.trigger.setAttribute(marker, '');
        next.trigger.setAttribute('aria-hidden', 'true');
      }
      projection.setAttribute(
        'aria-label',
        next.trigger.getAttribute('aria-label') ?? next.footer.querySelector('ion-searchbar')?.getAttribute('aria-label') ?? 'Search',
      );
      const sourceIcon = next.trigger.querySelector('ion-icon');
      const icon = projection.querySelector('ion-icon');
      if (sourceIcon?.shadowRoot) iconObserver.observe(sourceIcon.shadowRoot, { subtree: true, childList: true, attributes: true });
      if (sourceIcon && icon) {
        icon.icon = sourceIcon.icon;
        icon.name = sourceIcon.name;
        icon.src = sourceIcon.src;
      }
      container!.hidden = next.trigger.style.pointerEvents === 'none';
      projection.disabled = (next.trigger as HTMLIonFabButtonElement).disabled;
      const bounds = next.tabBar.getBoundingClientRect();
      const tabs = bounds.width > 0 && bounds.height > 0 && getComputedStyle(next.tabBar).visibility === 'visible' ? bounds : undefined;
      container!.style.left = tabs ? `${tabs.left + (tabs.width - 46) / 2}px` : '';
      container!.style.top = tabs ? `${tabs.top - 56}px` : '';
      container!.style.right = tabs ? 'auto' : '';
      container!.style.bottom = tabs ? 'auto' : '';
    },
  };
};
