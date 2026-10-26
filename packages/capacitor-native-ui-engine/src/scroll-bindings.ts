import type { WebProjectionSource } from './types.js';

/** Coordinate ownership, independent of any plugin's update transport or rendering. */
export const createScrollBindings = () => {
  let acknowledged: WebProjectionSource[] = [];
  let viewportWidth = 0;
  const motion = new WeakMap<HTMLElement, { version: number; moving: boolean }>();
  const reuse = (candidate: WebProjectionSource, width: number) => {
    const next = candidate.control.scroll;
    if (!candidate.scrollElement || !next || viewportWidth !== width) return false;
    return acknowledged.some((previous) => {
      const current = previous.control.scroll;
      return (
        previous.scrollElement === candidate.scrollElement &&
        current?.id === next.id &&
        current.contentWidth === next.contentWidth &&
        current.contentHeight === next.contentHeight &&
        (['viewport', 'clip'] as const).every((key) =>
          (['x', 'y', 'width', 'height'] as const).every((axis) => current[key][axis] === next[key][axis]),
        )
      );
    });
  };
  return {
    reuse,
    acknowledge(sources: WebProjectionSource[], width: number) {
      acknowledged = sources;
      viewportWidth = width;
    },
    changed(owner: HTMLElement) {
      motion.set(owner, { version: (motion.get(owner)?.version ?? 0) + 1, moving: true });
    },
    settled(owner: HTMLElement) {
      const state = motion.get(owner);
      if (state) state.moving = false;
    },
    eligible(candidate: WebProjectionSource, width: number) {
      return !candidate.scrollElement || !motion.get(candidate.scrollElement)?.moving || reuse(candidate, width);
    },
    acquiring(sources: WebProjectionSource[], width: number) {
      return new Map(
        sources.flatMap((source) =>
          source.scrollElement && !reuse(source, width)
            ? [[source.scrollElement, motion.get(source.scrollElement)?.version ?? 0] as const]
            : [],
        ),
      );
    },
    unconfirmed(sources: WebProjectionSource[], acquiring: Map<HTMLElement, number>) {
      return new Set(
        sources.flatMap((source) => {
          const owner = source.scrollElement,
            sample = source.control.scroll;
          return owner &&
            sample &&
            acquiring.has(owner) &&
            (acquiring.get(owner) !== (motion.get(owner)?.version ?? 0) ||
              owner.scrollLeft !== sample.offsetX ||
              owner.scrollTop !== sample.offsetY)
            ? [owner]
            : [];
        }),
      );
    },
  };
};
