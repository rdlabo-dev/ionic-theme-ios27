import type { WebProjectionSource as Candidate, PreparedWebProjection as CoveredSnapshot, Frame, WebProjectionTransport } from './types.js';
import { projectionState, type WebProjectionScope } from './web-projection-scope.js';
import { bounded, boundedListener } from './bridge.js';
import { projectionAncestors } from './geometry.js';
import { snapshotStyles } from './snapshot-styles.js';

export interface WebProjectionOptions {
  wake(): void;
  blocked(): boolean;
  revision?(): number;
  /** Select this surface's sources, e.g. the underlying page or the active overlay. */
  eligible?(source: Candidate): boolean;
  /** Caller-owned projection DOM in the intended stacking context. Undefined means unavailable. */
  target(source: HTMLElement, placement?: string): HTMLElement | undefined;
  /** Reject a cached image when its owning surface has changed. */
  current?(sources: HTMLElement[]): boolean;
  /** Temporary movement handoff: rebase return pixels to the current display DOM. */
  transient?: boolean;
}

interface Prepared {
  data: CoveredSnapshot;
  images: HTMLImageElement[];
  layer: HTMLElement;
  sources: HTMLElement[];
  targets: HTMLElement[];
  placements: (string | undefined)[];
  frames: Frame[];
  viewport: string;
  revision: number;
  layout: string;
}

const layout = (candidates: Candidate[]) =>
  JSON.stringify(candidates.map(({ control: c }) => [c.id, c.kind, c.placement, c.x, c.y, c.width, c.height, c.dark, c.rtl]));

// Native frames are viewport pixels; absolute children use the target's local
// padding box. Keep the conversion independent of theme dimensions.
const coordinateSpace = (target: HTMLElement, win: Window, style = win.getComputedStyle(target)) => {
  const rect = target.getBoundingClientRect();
  // offsetWidth/Height round fractional CSS sizes, which would introduce drift.
  const borderBox = (size: string, sides: string[]) => {
    const value = parseFloat(size);
    return style.display !== 'inline' && Number.isFinite(value)
      ? value +
          (style.boxSizing === 'border-box' ? 0 : sides.reduce((sum, side) => sum + (parseFloat(style.getPropertyValue(side)) || 0), 0))
      : NaN;
  };
  const width = borderBox(style.width, ['padding-left', 'padding-right', 'border-left-width', 'border-right-width']);
  const height = borderBox(style.height, ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width']);
  // Inline dimensions may be auto (or an ignored specified width). Native element
  // projection excludes transformed ancestors; use CSS zoom, not rounded offsets.
  let zoom = 1;
  if (!(width > 0 && height > 0)) {
    for (const element of [target, ...projectionAncestors(target)]) {
      const value = (element === target ? style : win.getComputedStyle(element)).getPropertyValue('zoom');
      zoom *= (parseFloat(value) || 1) / (value.endsWith('%') ? 100 : 1);
    }
  }
  const scaleX = width > 0 ? rect.width / width : zoom;
  const scaleY = height > 0 ? rect.height / height : zoom;
  return {
    x: rect.x,
    y: rect.y,
    scaleX: scaleX || 1,
    scaleY: scaleY || 1,
    left: (parseFloat(style.borderLeftWidth) || 0) - target.scrollLeft,
    top: (parseFloat(style.borderTopWidth) || 0) - target.scrollTop,
    position: style.position,
  };
};

/** Images are prepared after accepted native updates, never on the overlay's critical path. */
export const createWebProjection = async (
  doc: Document,
  transport: WebProjectionTransport,
  scope: WebProjectionScope,
  callbacks: WebProjectionOptions,
) => {
  const win = doc.defaultView!;
  const call = transport.send.bind(transport);
  const { imageMarker, sourcesChangedEvent, targetsChangedEvent } = scope;
  const { owners, visibleOwners, preparedOwners } = projectionState(scope);
  const sheets = new Map<Document | ShadowRoot, { base: HTMLStyleElement; image: HTMLStyleElement }>();
  const rootFor = (element: HTMLElement) => {
    const root = element.getRootNode();
    return root instanceof ShadowRoot ? root : doc;
  };
  const sheetFor = (root: Document | ShadowRoot) => {
    let pair = sheets.get(root);
    if (!pair) {
      const base = doc.createElement('style'),
        image = doc.createElement('style');
      base.setAttribute('data-native-ui-snapshot-base', '');
      image.setAttribute(imageMarker, '');
      base.textContent = snapshotStyles;
      (root instanceof ShadowRoot ? root : root.head).append(base, image);
      pair = { base, image };
      sheets.set(root, pair);
    }
    return pair.image;
  };
  const viewport = () => `${win.innerWidth}:${win.innerHeight}:${win.devicePixelRatio}`;
  let surfaceLayer: HTMLElement | undefined;
  let handoffPending = false;
  let presented = false;
  let paintFrame = 0;
  let presentation = 0;
  let cached: Prepared | undefined;
  let active: Prepared | undefined;
  let touching = false;
  let ending = false;
  let restoreTimeout = 0;
  let restoreRevision = 0;
  let generation = 0;
  let timer = 0;
  let visualRevision = 0;
  let preparedVisualRevision = -1;
  let stopped = false;
  let flight = false;
  let latest: { revision: number; candidates: Candidate[] } | undefined;
  const pendingCleanup = new Set<() => void>();
  const cleanup = (action: 'release' | 'restored', token: string, afterPaint: boolean) => {
    const run = () => {
      if (!pendingCleanup.delete(run)) return;
      void call({ action, token }).catch(() => {});
    };
    pendingCleanup.add(run);
    if (afterPaint && !stopped) win.requestAnimationFrame(() => win.requestAnimationFrame(run));
    else run();
  };
  const preparedSources = new Set<HTMLElement>();
  const clearPrepared = () => {
    preparedSources.forEach((source) => preparedOwners.delete(source));
    preparedSources.clear();
  };
  const dispose = (item: Prepared | undefined, afterPaint = false) => {
    if (!item || item === cached || item === active) return;
    item.layer.remove();
    item.images.forEach((image) => {
      image.src = '';
    });
    cleanup('release', item.data.token, afterPaint);
  };
  const select = (candidates: Candidate[]) =>
    candidates.filter((candidate) => {
      // Native scroll bindings retain offscreen controls. They have no visible
      // pixels to capture and must not prevent the other controls being prepared.
      if (candidate.control.scroll) {
        const rect = candidate.element.getBoundingClientRect();
        const clip = candidate.control.scroll.clip;
        if (rect.right <= clip.x || rect.bottom <= clip.y || rect.left >= clip.x + clip.width || rect.top >= clip.y + clip.height)
          return false;
      }
      return callbacks.eligible?.(candidate) ?? true;
    });
  const prepare = async () => {
    timer = 0;
    if (
      stopped ||
      flight ||
      touching ||
      active ||
      callbacks.blocked() ||
      !latest ||
      (cached?.revision === latest.revision && preparedVisualRevision === visualRevision)
    )
      return;
    const { revision, candidates } = latest;
    const stamp = generation;
    const visual = visualRevision;
    const size = viewport();
    const selected = select(candidates);
    if (!selected.length) return;
    flight = true;
    let result: Partial<CoveredSnapshot> | undefined;
    let adopted = false;
    const images: HTMLImageElement[] = [];
    try {
      let expired = false;
      const capture = call({ action: 'prepare', revision, viewportWidth: win.innerWidth, ids: selected.map((item) => item.control.id) });
      void capture
        .then((late) => {
          if (expired && late.token) void call({ action: 'release', token: late.token }).catch(() => {});
        })
        .catch(() => {});
      try {
        result = await bounded(capture);
      } finally {
        expired = true;
      }
      if (!result.token || !result.parts?.length) return;
      const ids = new Set(selected.map((candidate) => candidate.control.id));
      if (
        result.parts.some(
          (part) =>
            !part.url.startsWith('file:') ||
            !part.ids.length ||
            part.ids.some((id) => !ids.has(id)) ||
            ![part.x, part.y, part.width, part.height].every(Number.isFinite) ||
            part.width <= 0 ||
            part.height <= 0,
        )
      )
        return;
      if (new Set(result.parts.flatMap((part) => part.ids)).size !== ids.size) return;
      await bounded(
        Promise.all(
          result.parts.map(async (part) => {
            const image = doc.createElement('img');
            images.push(image);
            image.src = transport.resolveURL(part.url);
            await image.decode();
            return image;
          }),
        ),
      );
      if (
        stopped ||
        touching ||
        active ||
        callbacks.blocked() ||
        generation !== stamp ||
        viewport() !== size ||
        latest?.revision !== revision
      )
        return;
      const previous = cached;
      // Keep a decoded image-only layer ready for overlays which animate their
      // presenting surface. Never move the actual source controls into that page.
      const layer = doc.createElement('div');
      layer.setAttribute('data-native-ui-snapshot-layer', '');
      layer.setAttribute('aria-hidden', 'true');
      layer.inert = true;
      layer.style.cssText =
        'all:initial;position:absolute;width:0;height:0;overflow:visible;pointer-events:none;visibility:visible!important';
      images.forEach((image, index) => {
        const part = result!.parts![index];
        image.style.cssText = `all:initial;position:absolute;display:block;max-width:none;left:${part.x}px;top:${part.y}px;width:${part.width}px;height:${part.height}px;pointer-events:none;visibility:visible!important;`;
        layer.append(image);
      });
      cached = {
        data: result as CoveredSnapshot,
        images,
        layer,
        sources: Array.from(new Set(selected.flatMap((item) => [item.element, ...(item.sources ?? [])]))),
        targets: result.parts.map((part) => selected.find((candidate) => part.ids.includes(candidate.control.id))!.element),
        placements: result.parts.map((part) => selected.find((candidate) => part.ids.includes(candidate.control.id))!.control.placement),
        frames: [],
        viewport: size,
        revision,
        layout: layout(selected),
      };
      clearPrepared();
      cached.sources.forEach((source) => {
        preparedOwners.add(source);
        preparedSources.add(source);
      });
      render();
      win.dispatchEvent(new Event(sourcesChangedEvent));
      preparedVisualRevision = visual;
      adopted = true;
      dispose(previous);
    } catch {
      // Preparing a visual is optional. Preserve the previous image or the Web fallback.
    } finally {
      if (!adopted)
        images.forEach((image) => {
          image.src = '';
        });
      if (result?.token && !adopted) void call({ action: 'release', token: result.token }).catch(() => {});
      flight = false;
      if (latest && (latest.revision !== revision || visualRevision !== visual)) schedule();
    }
  };
  // Coalesce changes outside the presentation path. Completed images remain
  // available while their replacement is being rendered and decoded.
  const schedule = () => {
    win.clearTimeout(timer);
    if (!stopped && !active && !touching && !callbacks.blocked()) timer = win.setTimeout(() => void prepare(), 50);
  };
  const consider = (revision: number, candidates: Candidate[]) => {
    // Overlay retirement is not a new source layout. Preserve the pre-overlay
    // image until the presentation path has chosen whether to use it.
    if (callbacks.blocked()) return;
    if (!active && cached && cached.layout !== layout(select(candidates))) invalidate();
    if (latest?.revision !== revision) generation++;
    latest = { revision, candidates };
    if (cached?.revision !== revision || preparedVisualRevision !== visualRevision) schedule();
  };
  const changed = (scrollOwner?: EventTarget) => {
    // A pre-interaction state image is reusable; an image from another scroll
    // position/clip is not. Invalidate only the surface containing that owner.
    if (
      !active &&
      cached &&
      scrollOwner &&
      latest?.candidates.some((candidate) => candidate.scrollElement === scrollOwner && cached!.sources.includes(candidate.element))
    )
      invalidate();
    if (active) {
      updateOffsets();
      followBorderAnimation();
    }
    visualRevision++;
    generation++;
    schedule();
  };
  const listener = await boundedListener(
    transport.listen(({ active: pressed }) => {
      touching = pressed;
      generation++;
      win.clearTimeout(timer);
      // The completed cache itself is the pre-interaction image. No separate
      // pin can outlive the interaction and override a newer completed image.
      if (!pressed) schedule();
    }),
  );
  const preparedTargets = new Set<HTMLElement>();
  const clearTarget = (target: HTMLElement) => {
    if (preparedTargets.delete(target)) target.removeAttribute('data-native-ui-snapshot-prepared');
    target.removeAttribute('data-native-ui-snapshot-visible');
    target.removeAttribute(imageMarker);
    target.removeAttribute('data-native-ui-snapshot-source');
  };
  const detach = () => {
    presentation++;
    win.cancelAnimationFrame(paintFrame);
    win.cancelAnimationFrame(offsetFrame);
    offsetFrame = 0;
    offsets.clear();
    paintFrame = 0;
    handoffPending = false;
    presented = false;
    surfaceLayer?.remove();
    surfaceLayer = undefined;
    clearPrepared();
    active?.sources.forEach((source) => {
      owners.delete(source);
      visibleOwners.delete(source);
    });
    rendered.forEach(clearTarget);
    rendered.clear();
    sheets.forEach(({ base, image }) => {
      base.remove();
      image.remove();
    });
    sheets.clear();
  };
  const abandon = (expected = active, afterPaint = ending) => {
    if (active !== expected) return;
    const previous = new Set([active, cached]);
    detach();
    active = undefined;
    cached = undefined;
    ending = false;
    win.clearTimeout(restoreTimeout);
    previous.forEach((item) => dispose(item, afterPaint));
    callbacks.wake();
  };
  const finishRestoration = () => {
    if (!active) return;
    // A moved return invalidates the cached coordinates, but keeps the active
    // visual until Native has taken ownership at its destination.
    if (cached !== active) {
      abandon();
      return;
    }
    const image = active;
    detach();
    active = undefined;
    ending = false;
    win.clearTimeout(restoreTimeout);
    // Retire only the temporary return copy. Keep the pre-interaction image
    // available until a replacement finishes, including rapid overlay reopening.
    // Native's update acknowledgement precedes WebKit's paint. Keep its return
    // copy over live glass until the removed Web image has crossed a paint boundary.
    // Flush this callback before another cover can reuse the same token.
    cleanup('restored', image.data.token, true);
    image.sources.forEach((source) => {
      preparedOwners.add(source);
      preparedSources.add(source);
    });
    render();
    callbacks.wake();
  };
  const retireRestoration = () => {
    if (ending) finishRestoration();
    pendingCleanup.forEach((run) => run());
  };
  // Preparation, display and restoration must resolve the same captured placement.
  // An element-placement image never belongs to a previous rail proxy.
  const targetsFor = (image: Prepared) => image.targets.map((source, index) => callbacks.target(source, image.placements[index]));
  const rendered = new Set<HTMLElement>();
  const preparedKeys = new Map<HTMLElement, string>();
  const offsets = new Map<HTMLElement, { x: number; y: number; style: CSSStyleDeclaration }>();
  let offsetFrame = 0;
  const updateOffsets = () => {
    for (const [target, offset] of offsets) {
      if (!target.isConnected) continue;
      const style = win.getComputedStyle(target);
      const left = `${offset.x - (parseFloat(style.borderLeftWidth) || 0) + target.scrollLeft}px`;
      const top = `${offset.y - (parseFloat(style.borderTopWidth) || 0) + target.scrollTop}px`;
      if (offset.style.left !== left) offset.style.setProperty('left', left, 'important');
      if (offset.style.top !== top) offset.style.setProperty('top', top, 'important');
    }
  };
  const followBorderAnimation = () => {
    if (offsetFrame || !active || surfaceLayer) return;
    const movingBorder = [...offsets.keys()].some((target) =>
      target
        .getAnimations?.()
        .some(
          (animation) =>
            animation.playState === 'running' &&
            (animation.effect as KeyframeEffect | null)
              ?.getKeyframes()
              .some((frame) => ['borderLeftWidth', 'borderTopWidth', 'borderWidth'].some((property) => property in frame)),
        ),
    );
    if (movingBorder)
      offsetFrame = win.requestAnimationFrame(() => {
        offsetFrame = 0;
        updateOffsets();
        followBorderAnimation();
      });
  };
  const render = () => {
    const image = active ?? cached;
    if (!image || ending) return;
    const targets = targetsFor(image);
    if (active) {
      if (targets.some((target) => !target?.isConnected || !sheets.has(rootFor(target)))) {
        abandon(active, false);
        return;
      }
      const next = new Set<HTMLElement>();
      for (const [index, source] of image.targets.entries()) {
        const key = preparedKeys.get(source);
        const target = targets[index];
        if (!key || !target?.isConnected) continue;
        target.setAttribute(imageMarker, key);
        target.setAttribute('data-native-ui-snapshot-source', '');
        target.toggleAttribute('data-native-ui-snapshot-visible', presented && !surfaceLayer);
        next.add(target);
      }
      for (const target of rendered) if (!next.has(target)) clearTarget(target);
      rendered.clear();
      next.forEach((target) => rendered.add(target));
      return;
    }
    preparedKeys.clear();
    offsets.clear();
    rendered.forEach(clearTarget);
    rendered.clear();
    // Reuse the image stylesheet. Presentation states belong to the runtime's
    // permanent CSS, which survives cache replacement and image retirement.
    const groups = new Map<HTMLStyleElement, { rules: string[]; positions: { target: HTMLElement; x: number; y: number }[] }>();

    for (const target of new Set(targets)) {
      if (!target) continue;
      rendered.add(target);
      const sheet = sheetFor(rootFor(target));
      let group = groups.get(sheet);
      if (!group) {
        group = { rules: [], positions: [] };
        groups.set(sheet, group);
      }
      const { rules, positions } = group;
      // A decoded clone stays concealed even if this cache is invalidated before
      // the projection adapter publishes its next Native/Web ownership state.
      if (target !== image.targets[targets.indexOf(target)] && !target.hasAttribute('data-native-ui-snapshot-prepared')) {
        target.setAttribute('data-native-ui-snapshot-prepared', '');
        preparedTargets.add(target);
      }
      target.toggleAttribute('data-native-ui-snapshot-visible', !!active && !surfaceLayer);
      if (active) target.setAttribute('data-native-ui-snapshot-source', '');
      const indices = targets.flatMap((owner, index) => (owner === target ? [index] : []));
      const style = win.getComputedStyle(target);
      {
        const space = coordinateSpace(target, win, style);
        indices.forEach((index) => {
          const part = image.data.parts[index];
          image.frames[index] = {
            x: (part.x - space.x) / space.scaleX,
            y: (part.y - space.y) / space.scaleY,
            width: part.width / space.scaleX,
            height: part.height / space.scaleY,
          };
        });
      }
      const frames = indices.map((index) => image.frames[index]);
      const x = Math.min(...frames.map((frame) => frame.x));
      const y = Math.min(...frames.map((frame) => frame.y));
      const right = Math.max(...frames.map((frame) => frame.x + frame.width));
      const bottom = Math.max(...frames.map((frame) => frame.y + frame.height));
      const left = (parseFloat(style.borderLeftWidth) || 0) - target.scrollLeft;
      const top = (parseFloat(style.borderTopWidth) || 0) - target.scrollTop;
      const key = `${image.data.token}-${indices[0]}`;
      indices.forEach((index) => preparedKeys.set(image.targets[index], key));
      target.setAttribute(imageMarker, key);
      rules.push(
        `[${imageMarker}="${key}"][data-native-ui-snapshot-visible] { ${style.position === 'static' ? 'position:relative!important;' : ''} }`,
      );
      const backgrounds = indices.map((index) => {
        const frame = image.frames[index];
        return `url(${JSON.stringify(image.images[index].src)}) ${frame.x - x}px ${frame.y - y}px / ${frame.width}px ${frame.height}px no-repeat`;
      });
      const declaration = doc.createElement('span').style;
      declaration.cssText = `left:${x - left}px;top:${y - top}px;width:${right - x}px;height:${bottom - y}px;background:${backgrounds.join(',')};`;
      for (const property of Array.from(declaration))
        declaration.setProperty(property, declaration.getPropertyValue(property), 'important');
      rules.push(`[${imageMarker}="${key}"][${imageMarker}]::before { ${declaration.cssText} }`);
      positions.push({ target, x, y });
    }
    for (const [sheet, { rules, positions }] of groups) {
      sheet.textContent = rules.join('\n');
      positions.forEach(({ target, x, y }, index) =>
        offsets.set(target, {
          x,
          y,
          style: (sheet.sheet!.cssRules[index * 2 + 1] as CSSStyleRule).style,
        }),
      );
    }
  };
  const targetsChanged = () => render();
  win.addEventListener(targetsChangedEvent, targetsChanged);
  const begin = (projectionLayer?: HTMLElement) => {
    retireRestoration();
    if (stopped || active || (projectionLayer && !projectionLayer.isConnected)) return;
    const image = cached;
    if (
      !image ||
      image.viewport !== viewport() ||
      image.sources.some((source) => !source.isConnected) ||
      (callbacks.current && !callbacks.current(image.targets)) ||
      image.targets.some((source) => !preparedKeys.has(source)) ||
      targetsFor(image).some((target) => !target?.isConnected) ||
      [...rendered].some((target) => !target.isConnected)
    )
      return;
    // Keep the captured border-box geometry; only rebase the CSS padding-box
    // offset after pre-interaction state changes. No capture or viewport remeasure.
    updateOffsets();
    // A cached image may span multiple presentations; bridge replies may not.
    const currentPresentation = ++presentation;
    const isCurrent = () => presentation === currentPresentation;
    handoffPending = true;
    presented = false;
    active = image;
    if (projectionLayer) {
      // One coordinate conversion before the host starts its animation. The browser
      // then applies the same transform, filter and clip to page and images.
      const space = coordinateSpace(projectionLayer, win);
      surfaceLayer = image.layer;
      surfaceLayer.style.display = 'none';
      surfaceLayer.style.left = `${-space.x / space.scaleX - space.left}px`;
      surfaceLayer.style.top = `${-space.y / space.scaleY - space.top}px`;
      surfaceLayer.style.transformOrigin = '0 0';
      surfaceLayer.style.transform = `scale(${1 / space.scaleX}, ${1 / space.scaleY})`;
      projectionLayer.append(surfaceLayer);
    }
    // Reuse decoded pixels; no capture, bridge acknowledgement or animation wait.
    generation++;
    win.clearTimeout(timer);
    image.sources.forEach((source) => {
      owners.add(source);
    });
    rendered.forEach((target) => {
      target.setAttribute('data-native-ui-snapshot-source', '');
      target.toggleAttribute('data-native-ui-snapshot-visible', presented && !surfaceLayer);
    });
    // Reconciliation may continue after one frame even if the optional bridge reply
    // is delayed. The ordered native transport processes cover before that update.
    paintFrame = win.requestAnimationFrame(() => {
      paintFrame = 0;
      if (!isCurrent()) return;
      handoffPending = false;
      callbacks.wake();
    });
    void bounded(call({ action: 'cover', token: image.data.token, ...(callbacks.transient ? { transient: true } : {}) }))
      .then((result) => {
        if (!isCurrent()) return;
        handoffPending = false;
        if (result?.shown !== true) {
          abandon(image, false);
          return;
        }
        // Live translucent Native must be hidden before its composited Web image
        // becomes visible. Native's prepared entry copy spans this bridge interval.
        if (!ending) {
          presented = true;
          image.sources.forEach((source) => visibleOwners.add(source));
          if (surfaceLayer) surfaceLayer.style.display = 'block';
          render();
          updateOffsets();
          followBorderAnimation();
        }
        win.cancelAnimationFrame(paintFrame);
        paintFrame = win.requestAnimationFrame(() => {
          paintFrame = 0;
          if (!isCurrent()) return;
          void call({ action: 'painted', token: image.data.token }).catch(() => {
            if (isCurrent()) abandon(image, false);
          });
        });
        callbacks.wake();
      })
      .catch(() => {
        if (isCurrent()) abandon(image, false);
      });
  };
  const end = () => {
    if (!active || stopped || ending) return;
    // A return belongs to the captured surface, never to the modal exposed beneath it.
    if (callbacks.current && !callbacks.current(active.targets)) {
      abandon(active, false);
      return;
    }
    if (callbacks.blocked()) return;
    if (callbacks.transient) {
      const image = active;
      const targets = targetsFor(image);
      if (targets.some((target) => !target?.isConnected)) {
        abandon(image, false);
        return;
      }
      const parts = targets.map((target, index) => {
        const space = coordinateSpace(target!, win);
        const frame = image.frames[index];
        return {
          ...image.data.parts[index],
          x: space.x + frame.x * space.scaleX,
          y: space.y + frame.y * space.scaleY,
          width: frame.width * space.scaleX,
          height: frame.height * space.scaleY,
        };
      });
      if (
        parts.some((part, index) =>
          ['x', 'y', 'width', 'height'].some((key) => part[key as keyof Frame] !== image.data.parts[index][key as keyof Frame]),
        )
      )
        cached = undefined;
      // Both requests use the same ordered bridge. Reprojection need not await this optional copy.
      void call({ action: 'restore', token: image.data.token, viewportWidth: win.innerWidth, parts }).catch(() => {});
    }
    restoreRevision = callbacks.revision?.() ?? latest?.revision ?? 0;
    ending = true;
    active.sources.forEach((source) => owners.delete(source));
    restoreTimeout = win.setTimeout(() => {
      if (ending) abandon(active, false);
    }, 250);
    callbacks.wake();
  };
  const updated = (token: string | undefined, restoredIDs?: string[], revision?: number) => {
    if (!ending || !active || revision === undefined || revision <= restoreRevision) return;
    if (!callbacks.transient && token) return;
    if (!active.data.parts.every((part) => part.ids.every((id) => restoredIDs?.includes(id)))) return;
    // Retire the Web image at the native restore acknowledgement, not after
    // another complete reconciliation/paint cycle over live glass.
    finishRestoration();
    schedule();
  };
  const invalidate = () => {
    pendingCleanup.forEach((run) => run());
    generation++;
    win.clearTimeout(timer);
    const previous = cached;
    cached = undefined;
    dispose(previous);
    if (active) abandon(active, false);
    else {
      detach();
      preparedKeys.clear();
      win.dispatchEvent(new Event(sourcesChangedEvent));
    }
  };
  return {
    consider,
    changed,
    get token() {
      return ending ? undefined : active?.data.token;
    },
    begin,
    get restoring() {
      return ending;
    },
    get handoffPending() {
      return handoffPending;
    },
    retireRestoration,
    end,
    updated,
    invalidate,
    async destroy() {
      stopped = true;
      win.removeEventListener(targetsChangedEvent, targetsChanged);
      invalidate();
      await bounded(Promise.resolve(listener?.remove())).catch(() => {});
    },
  };
};
export type WebProjection = Awaited<ReturnType<typeof createWebProjection>>;
