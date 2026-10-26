/** Injected runtime uses the existing native bridge; never initializes a second Capacitor core. */
export const Capacitor = {
  convertFileSrc: (url: string): string =>
    (globalThis as unknown as { Capacitor: { convertFileSrc(url: string): string } }).Capacitor.convertFileSrc(url),
};
