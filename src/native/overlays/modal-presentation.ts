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
  return { kind: overlay.presentingElement !== undefined ? 'card' : 'normal', animated: overlay.animated };
};

/** Sheet detent changes stay with the modal adapter, not the document relay. */
export const syncModalBreakpoint = (overlay: HTMLIonModalElement, plugin: NativeUIShellPlugin, id: string): (() => void) => {
  const breakpoint = (event: Event) => {
    void plugin.setOverlayBreakpoint({ id, breakpoint: (event as CustomEvent).detail.breakpoint }).catch(console.error);
  };
  overlay.addEventListener('ionBreakpointDidChange', breakpoint);
  return () => overlay.removeEventListener('ionBreakpointDidChange', breakpoint);
};
