export const handoffDuration = 180;
export const fadeMarker = 'data-native-ui-shell-fading';

/** Only visual opacity animates; the runtime transfers input/accessibility ownership once. */
export const createCrossfade = (win: Window) => {
  const active = new Map<HTMLElement, Animation>();
  const retired = new Set<HTMLElement>();
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const finish = (element: HTMLElement, animation: Animation) => {
    if (active.get(element) !== animation) return;
    active.delete(element);
    element.removeAttribute(fadeMarker);
    animation.cancel();
    if (retired.delete(element)) element.remove();
  };
  const cancelAll = () => {
    for (const [element, animation] of active) finish(element, animation);
  };
  reduced.addEventListener('change', cancelAll);
  const api = {
    duration: (instant = false) => (reduced.matches || instant ? 0 : handoffDuration),
    play(element: HTMLElement, toNative: boolean, instant = false) {
      const previous = active.get(element);
      const current = Number(win.getComputedStyle(element).opacity);
      previous?.cancel();
      active.delete(element);
      const opacity = Number(win.getComputedStyle(element).opacity);
      // Tab switches skip the opacity handoff so a retiring native snapshot cannot linger.
      if (reduced.matches || instant || !element.isConnected) {
        element.removeAttribute(fadeMarker);
        return;
      }
      element.setAttribute(fadeMarker, '');
      const animation = element.animate([{ opacity: previous ? current : toNative ? opacity : 0 }, { opacity: toNative ? 0 : opacity }], {
        duration: handoffDuration,
        easing: 'ease-in-out',
        fill: 'both',
      });
      active.set(element, animation);
      void animation.finished.then(
        () => finish(element, animation),
        () => finish(element, animation),
      );
    },
    retire(element: HTMLElement, instant = false) {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
      element.style.setProperty('pointer-events', 'none', 'important');
      if (!api.duration(instant) || !element.isConnected) {
        const previous = active.get(element);
        if (previous) finish(element, previous);
        element.remove();
        return;
      }
      retired.add(element);
      api.play(element, true);
    },
    async settled() {
      await Promise.all(Array.from(active.values(), (animation) => animation.finished.catch(() => {})));
    },
    destroy() {
      reduced.removeEventListener('change', cancelAll);
      cancelAll();
    },
  };
  return api;
};
