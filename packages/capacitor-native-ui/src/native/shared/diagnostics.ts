/** Opt-in diagnostics. Never log props, action data, or application exception messages. */
export const createDiagnostics = (enabled = false) => {
  const elements = new WeakMap<HTMLElement, Set<string>>();
  const global = new Set<string>();
  return (reason: string, element?: HTMLElement): void => {
    if (!enabled) return;
    const seen = element ? (elements.get(element) ?? new Set<string>()) : global;
    if (seen.has(reason)) return;
    seen.add(reason);
    if (element) elements.set(element, seen);
    console.info(`[Native UI] ${reason}`, ...(element ? [element] : []));
  };
};
