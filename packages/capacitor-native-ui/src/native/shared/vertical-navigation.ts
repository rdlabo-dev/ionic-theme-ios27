/** Mirror each Web page's ancestry without depending on tab selection timing. */
export const createVerticalNavigation = () => {
  const paths = new WeakMap<HTMLElement, HTMLElement[]>();
  let transition: { entering: HTMLElement; leaving?: HTMLElement; before: HTMLElement[]; after: HTMLElement[] } | undefined;
  return {
    begin(entering: HTMLElement, leaving?: HTMLElement, direction?: 'forward' | 'back' | 'root') {
      const before = leaving ? (paths.get(leaving) ?? [leaving]) : [];
      const index = before.indexOf(entering);
      const after =
        direction === 'root'
          ? [entering]
          : index >= 0
            ? before.slice(0, index + 1)
            : direction === 'back'
              ? [entering]
              : [...before, entering];
      const current = { entering, leaving, before, after };
      transition = current;
      return (canceled: boolean) => {
        if (transition !== current) return false;
        if (canceled) {
          if (leaving) paths.set(leaving, before);
        } else paths.set(entering, after);
        transition = undefined;
        return true;
      };
    },
    read(page: HTMLElement): HTMLElement[] {
      if (transition?.entering === page) return transition.after;
      if (transition?.leaving === page) return transition.before;
      return paths.get(page) ?? [page];
    },
  };
};
