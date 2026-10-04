import type { NativeUIShellPlugin, ShellModalPresentation } from '../definitions';

export const modalPresentation = (overlay: HTMLIonModalElement): ShellModalPresentation => {
  if (overlay.breakpoints && overlay.initialBreakpoint !== undefined) {
    return {
      kind: 'sheet',
      animated: overlay.animated,
      breakpoints: overlay.breakpoints,
      initialBreakpoint: overlay.initialBreakpoint,
      backdropBreakpoint: overlay.backdropBreakpoint,
      expandToScroll: overlay.expandToScroll,
      handle: overlay.handle,
    };
  }
  const kind = overlay.presentingElement !== undefined ? ('card' as const) : ('normal' as const);
  return { kind, animated: overlay.animated, topInset: kind === 'card' ? cardInset(overlay.ownerDocument) : undefined };
};

// Mirrors Ionic's card height: `100% - max(30px, var(--ion-safe-area-top)) - 10px`.
const cardInset = (doc: Document): number => {
  const probe = doc.createElement('div');
  probe.style.cssText = 'position:fixed;top:env(safe-area-inset-top);left:0;visibility:hidden;pointer-events:none';
  doc.body.append(probe);
  const safe = probe.getBoundingClientRect().top;
  probe.remove();
  return Math.max(30, safe) + 10;
};

/** Sheet detent changes stay with the modal adapter, not the document relay. */
export const syncModalBreakpoint = (overlay: HTMLIonModalElement, plugin: NativeUIShellPlugin, id: string): (() => void) => {
  const breakpoint = (event: Event) => {
    void plugin.setOverlayBreakpoint({ id, breakpoint: (event as CustomEvent).detail.breakpoint }).catch(console.error);
  };
  overlay.addEventListener('ionBreakpointDidChange', breakpoint);
  return () => overlay.removeEventListener('ionBreakpointDidChange', breakpoint);
};
