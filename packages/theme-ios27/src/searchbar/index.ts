export interface SearchbarCancelButtonIconSupport {
  /** Re-read cancelButtonIcon after changing it as a JavaScript property. */
  refresh: () => void;
  destroy: () => void;
}

const effects = new WeakMap<HTMLIonSearchbarElement, SearchbarCancelButtonIconSupport>();

/**
 * Temporary rendering shim for cancelButtonIcon in iOS mode.
 * Remove once the supported Ionic versions render the icon themselves.
 */
export const supportSeachbarCancelButtonIcon = (searchbar: HTMLIonSearchbarElement): SearchbarCancelButtonIconSupport => {
  const existing = effects.get(searchbar);
  if (existing) return existing;

  let icon: HTMLIonIconElement | undefined;
  let destroyed = false;
  const removeIcon = () => {
    const button = icon?.closest<HTMLElement>('.searchbar-cancel-button');
    icon?.remove();
    if (button && searchbar.animated && !searchbar.classList.contains('searchbar-should-show-cancel')) {
      const property = getComputedStyle(searchbar).direction === 'rtl' ? 'marginLeft' : 'marginRight';
      button.style[property] = `${-button.offsetWidth}px`;
    }
  };
  const refresh = () => {
    if (destroyed) return;
    const content = searchbar.querySelector<HTMLElement>('.searchbar-cancel-button > div');
    const enabled = searchbar.matches('.ios:not(.ios-theme-disabled, .ios26-disabled, .searchbar-classic)');
    const hasNativeIcon = content && Array.from(content.querySelectorAll('ion-icon')).some((element) => element !== icon);
    if (!enabled || !content || !searchbar.cancelButtonIcon || hasNativeIcon) {
      removeIcon();
      return;
    }
    if (!icon) {
      icon = searchbar.ownerDocument.createElement('ion-icon');
      icon.classList.add('ios27-searchbar-cancel-icon');
      icon.setAttribute('aria-hidden', 'true');
    }
    if (icon.icon !== searchbar.cancelButtonIcon) icon.icon = searchbar.cancelButtonIcon;
    if (icon.parentElement !== content) content.append(icon);
  };

  // Reattach when Ionic creates/replaces the cancel button (e.g. never -> focus).
  const observer = new MutationObserver(refresh);
  observer.observe(searchbar, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'mode', 'cancel-button-icon'],
  });
  const effect: SearchbarCancelButtonIconSupport = {
    refresh,
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      observer.disconnect();
      removeIcon();
      effects.delete(searchbar);
    },
  };
  effects.set(searchbar, effect);
  refresh();
  return effect;
};
