export const fadeMarker = 'data-native-ui-shell-fading';

/** Only visual opacity animates; the runtime transfers input/accessibility ownership once. */
export const createCrossfade = (win: Window) => {
  const active = new Map<HTMLElement, Animation>();
  const reduced = win.matchMedia('(prefers-reduced-motion: reduce)');
  const finish = (element: HTMLElement, animation: Animation) => {
    if (active.get(element) !== animation) return;
    active.delete(element);
    element.removeAttribute(fadeMarker);
    animation.cancel();
  };
  const cancelAll = () => {
    for (const [element, animation] of active) finish(element, animation);
  };
  reduced.addEventListener('change', cancelAll);
  return {
    duration: (instant = false) => (reduced.matches || instant ? 0 : 180),
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
        duration: 180,
        easing: 'ease-in-out',
        fill: 'both',
      });
      active.set(element, animation);
      void animation.finished.then(
        () => finish(element, animation),
        () => finish(element, animation),
      );
    },
    async settled() {
      await Promise.all(Array.from(active.values(), (animation) => animation.finished.catch(() => {})));
    },
    destroy() {
      reduced.removeEventListener('change', cancelAll);
      cancelAll();
    },
  };
};
