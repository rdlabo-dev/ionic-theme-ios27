import { Capacitor } from '@capacitor/core';
import type { Candidate } from './candidate';
import type { CoveredSnapshot, NativeUIPlugin } from '../definitions';
import { bounded, boundedListener } from './bridge';

import {
  imageMarker,
  owners,
  visibleOwners,
  snapshotTargets,
  snapshotTargetsChanged,
  preparedOwners,
  coveredSourcesChanged,
} from './covered-source';

interface Prepared {
  data: CoveredSnapshot;
  images: HTMLImageElement[];
  layer: HTMLElement;
  sources: HTMLElement[];
  targets: HTMLElement[];
  vertical: boolean[];
  viewport: string;
  revision: number;
  layout: string;
}

const layout = (candidates: Candidate[]) =>
  JSON.stringify(candidates.map(({ control: c }) => [c.id, c.kind, c.placement, c.x, c.y, c.width, c.height, c.dark, c.rtl]));

/** Images are prepared after accepted native updates, never on the overlay's critical path. */
export const createCoveredSnapshots = async (
  doc: Document,
  plugin: NativeUIPlugin,
  listen: NativeUIPlugin['addListener'],
  callbacks: { wake: () => void; blocked: () => boolean; modal?: () => HTMLIonModalElement | undefined; revision?: () => number },
) => {
  const win = doc.defaultView!;
  const call = plugin.coveredSnapshot!.bind(plugin);
  const viewport = () => `${win.innerWidth}:${win.innerHeight}:${win.devicePixelRatio}`;
  let sheet: HTMLStyleElement | undefined;
  let surfaceLayer: HTMLElement | undefined;
  let handoffPending = false;
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
    candidates.filter((candidate) =>
      callbacks.modal
        ? !!callbacks.modal() &&
          candidate.element.closest('ion-modal') === callbacks.modal() &&
          candidate.control.placement === 'vertical-bars'
        : !candidate.element.closest('ion-modal'),
    );
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
            image.src = Capacitor.convertFileSrc(part.url);
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
      // presenting surface. Never move the actual Ionic controls into that page.
      const layer = doc.createElement('div');
      layer.setAttribute('data-native-ui-snapshot-layer', '');
      layer.setAttribute('aria-hidden', 'true');
      layer.inert = true;
      layer.style.cssText = 'all:initial;position:absolute;width:0;height:0;overflow:visible;pointer-events:none;z-index:1001';
      images.forEach((image, index) => {
        const part = result!.parts![index];
        image.style.cssText = `all:initial;position:absolute;display:block;max-width:none;left:${part.x}px;top:${part.y}px;width:${part.width}px;height:${part.height}px;pointer-events:none;`;
        layer.append(image);
      });
      cached = {
        data: result as CoveredSnapshot,
        images,
        layer,
        sources: Array.from(new Set(selected.flatMap((item) => [item.element, ...(item.sources ?? [])]))),
        targets: result.parts.map((part) => selected.find((candidate) => part.ids.includes(candidate.control.id))!.element),
        vertical: result.parts.map(
          (part) => selected.find((candidate) => part.ids.includes(candidate.control.id))!.control.placement === 'vertical-bars',
        ),
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
      win.dispatchEvent(new Event(coveredSourcesChanged));
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
  const changed = () => {
    visualRevision++;
    generation++;
    schedule();
  };
  const listener = await boundedListener(
    listen('snapshotInteraction', ({ active: pressed }) => {
      touching = pressed;
      generation++;
      win.clearTimeout(timer);
      // The completed cache itself is the pre-interaction image. No separate
      // pin can outlive the interaction and override a newer completed image.
      if (!pressed) schedule();
    }),
  );
  const clearTarget = (target: HTMLElement) => {
    target.removeAttribute('data-native-ui-snapshot-visible');
    target.removeAttribute(imageMarker);
    target.removeAttribute('data-native-ui-snapshot-source');
  };
  const detach = () => {
    presentation++;
    win.cancelAnimationFrame(paintFrame);
    paintFrame = 0;
    handoffPending = false;
    surfaceLayer?.remove();
    surfaceLayer = undefined;
    clearPrepared();
    active?.sources.forEach((source) => {
      owners.delete(source);
      visibleOwners.delete(source);
    });
    rendered.forEach(clearTarget);
    rendered.clear();
    sheet?.remove();
    sheet = undefined;
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
  const rendered = new Set<HTMLElement>();
  const preparedKeys = new Map<HTMLElement, string>();
  const render = () => {
    const image = active ?? cached;
    if (!image || ending) return;
    if (active) {
      const next = new Set<HTMLElement>();
      for (const source of image.targets) {
        const key = preparedKeys.get(source);
        const target = snapshotTargets.get(source) ?? source;
        if (!key || !target.isConnected) continue;
        target.setAttribute(imageMarker, key);
        target.setAttribute('data-native-ui-snapshot-source', '');
        target.toggleAttribute('data-native-ui-snapshot-visible', !surfaceLayer);
        next.add(target);
      }
      for (const target of rendered) if (!next.has(target)) clearTarget(target);
      rendered.clear();
      next.forEach((target) => rendered.add(target));
      return;
    }
    preparedKeys.clear();
    rendered.forEach(clearTarget);
    rendered.clear();
    // Reuse the image stylesheet. Presentation states belong to the runtime's
    // permanent CSS, which survives cache replacement and image retirement.
    sheet ??= doc.createElement('style');
    sheet.setAttribute(imageMarker, '');
    const rules: string[] = [];

    const targets = image.targets.map((source, index) => {
      const projection = snapshotTargets.get(source);
      return image.vertical[index] && source.matches('ion-button, ion-buttons, ion-back-button, ion-menu-button')
        ? projection?.isConnected
          ? projection
          : undefined
        : source;
    });
    for (const target of new Set(targets)) {
      if (!target) continue;
      rendered.add(target);
      // A decoded clone stays concealed even if this cache is invalidated before
      // the projection adapter publishes its next Native/Web ownership state.
      if (target !== image.targets[targets.indexOf(target)]) target.setAttribute('data-native-ui-snapshot-prepared', '');
      target.removeAttribute('data-native-ui-snapshot-visible');
      const indices = targets.flatMap((owner, index) => (owner === target ? [index] : []));
      const parts = indices.map((index) => image.data.parts[index]);
      const x = Math.min(...parts.map((part) => part.x));
      const y = Math.min(...parts.map((part) => part.y));
      const right = Math.max(...parts.map((part) => part.x + part.width));
      const bottom = Math.max(...parts.map((part) => part.y + part.height));
      const rect = target.getBoundingClientRect();
      const targetStyle = win.getComputedStyle(target);
      const borderLeft = parseFloat(targetStyle.borderLeftWidth) || 0;
      const borderTop = parseFloat(targetStyle.borderTopWidth) || 0;
      const key = `${image.data.token}-${indices[0]}`;
      indices.forEach((index) => preparedKeys.set(image.targets[index], key));
      target.setAttribute(imageMarker, key);
      rules.push(
        `[${imageMarker}="${key}"][data-native-ui-snapshot-visible] { ${targetStyle.position === 'static' ? 'position:relative!important;' : ''} }`,
      );
      const backgrounds = indices.map((index) => {
        const part = image.data.parts[index];
        return `url(${JSON.stringify(image.images[index].src)}) ${part.x - x}px ${part.y - y}px / ${part.width}px ${part.height}px no-repeat`;
      });
      const declaration = doc.createElement('span').style;
      declaration.cssText = `left:${x - rect.x - borderLeft}px;top:${y - rect.y - borderTop}px;width:${right - x}px;height:${bottom - y}px;background:${backgrounds.join(',')};`;
      for (const property of Array.from(declaration))
        declaration.setProperty(property, declaration.getPropertyValue(property), 'important');
      rules.push(`[${imageMarker}="${key}"][${imageMarker}]::before { ${declaration.cssText} }`);
    }
    sheet.textContent = rules.join('\n');
    if (!sheet.isConnected) doc.head.append(sheet);
  };
  win.addEventListener(snapshotTargetsChanged, render);
  const begin = (presentingSurface?: HTMLElement) => {
    retireRestoration();
    if (stopped || active) return;
    const image = cached;
    if (
      !image ||
      image.viewport !== viewport() ||
      image.sources.some((source) => !source.isConnected) ||
      (callbacks.modal && image.targets.some((source) => source.closest('ion-modal') !== callbacks.modal!())) ||
      image.targets.some((source) => !preparedKeys.has(source)) ||
      [...rendered].some((target) => !target.isConnected)
    )
      return;
    // A cached image may span multiple presentations; bridge replies may not.
    const currentPresentation = ++presentation;
    const isCurrent = () => presentation === currentPresentation;
    handoffPending = true;
    active = image;
    if (presentingSurface?.isConnected) {
      // One coordinate conversion before Ionic starts its animation. The browser
      // then applies the same transform, filter and clip to page and images.
      const rect = presentingSurface.getBoundingClientRect();
      surfaceLayer = image.layer;
      surfaceLayer.style.left = `${-rect.left - presentingSurface.clientLeft}px`;
      surfaceLayer.style.top = `${-rect.top - presentingSurface.clientTop}px`;
      presentingSurface.append(surfaceLayer);
    }
    // Reuse decoded pixels; no capture, bridge acknowledgement or animation wait.
    generation++;
    win.clearTimeout(timer);
    image.sources.forEach((source) => {
      owners.add(source);
      visibleOwners.add(source);
    });
    rendered.forEach((target) => {
      target.setAttribute('data-native-ui-snapshot-source', '');
      target.toggleAttribute('data-native-ui-snapshot-visible', !surfaceLayer);
    });
    void bounded(call({ action: 'cover', token: image.data.token, ...(callbacks.modal ? { transient: true } : {}) }))
      .then((result) => {
        if (!isCurrent()) return;
        handoffPending = false;
        if (result?.shown === false) abandon(image, false);
        else callbacks.wake();
      })
      .catch(() => {
        if (isCurrent()) abandon(image, false);
      });
    paintFrame = win.requestAnimationFrame(() => {
      paintFrame = 0;
      if (!isCurrent()) return;
      // The optional cover acknowledgement must not stall unrelated Native UI updates.
      handoffPending = false;
      void call({ action: 'painted', token: image.data.token }).catch(() => {
        if (isCurrent()) abandon(image, false);
      });
      callbacks.wake();
    });
  };
  const end = () => {
    if (!active || stopped || ending) return;
    // A return belongs to the captured surface, never to the modal exposed beneath it.
    if (callbacks.modal && active.targets.some((source) => source.closest('ion-modal') !== callbacks.modal!())) {
      abandon(active, false);
      return;
    }
    if (callbacks.blocked()) return;
    if (callbacks.modal) {
      const image = active;
      const parts = image.targets.map((source, index) => {
        const target = snapshotTargets.get(source) ?? source;
        const rect = target.getBoundingClientRect();
        const pseudo = win.getComputedStyle(target, '::before');
        const style = win.getComputedStyle(target);
        const peers = image.data.parts.filter((_, i) => preparedKeys.get(image.targets[i]) === preparedKeys.get(source));
        const part = image.data.parts[index];
        return {
          ...part,
          x:
            rect.x +
            (parseFloat(style.borderLeftWidth) || 0) +
            (parseFloat(pseudo.left) || 0) +
            part.x -
            Math.min(...peers.map((p) => p.x)),
          y: rect.y + (parseFloat(style.borderTopWidth) || 0) + (parseFloat(pseudo.top) || 0) + part.y - Math.min(...peers.map((p) => p.y)),
        };
      });
      if (parts.some((part, index) => part.x !== image.data.parts[index].x || part.y !== image.data.parts[index].y)) cached = undefined;
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
    if (!callbacks.modal && token) return;
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
      win.dispatchEvent(new Event(coveredSourcesChanged));
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
      win.removeEventListener(snapshotTargetsChanged, render);
      invalidate();
      await bounded(Promise.resolve(listener?.remove())).catch(() => {});
      if (!callbacks.modal) await bounded(call({ action: 'reset' })).catch(() => {});
    },
  };
};
export type CoveredSnapshots = Awaited<ReturnType<typeof createCoveredSnapshots>>;
