import type { ListenerHandle } from './types.js';
import { boundedListener } from './bridge.js';

export type ProjectionDestination = 'native' | 'web' | 'none';

/** Notifications from the existing plugin proxy; public plugin methods are never intercepted. */
export interface ProjectionEvents {
  addListener(name: string, listener: (event: unknown) => void): Promise<ListenerHandle>;
  update?: readonly string[];
  projection?: Partial<Record<ProjectionDestination, readonly string[]>>;
  /** Required when the plugin emits events for multiple independent surfaces. */
  accepts?(event: unknown): boolean;
}

/** Subscribe once per event, including events that both update and change destination. */
export const bindProjectionEvents = async (
  events: ProjectionEvents,
  receive: (destination: ProjectionDestination | undefined, updated: boolean) => void,
): Promise<ListenerHandle> => {
  const routes = new Map<string, { destination?: ProjectionDestination; updated: boolean }>();
  for (const name of events.update ?? []) routes.set(name, { updated: true });
  for (const destination of ['native', 'web', 'none'] as const) {
    for (const name of events.projection?.[destination] ?? []) {
      const route = routes.get(name) ?? { updated: false };
      if (route.destination && route.destination !== destination)
        throw new TypeError(`Projection event "${name}" has conflicting destinations`);
      routes.set(name, { ...route, destination });
    }
  }
  let stopped = false;
  const handles: ListenerHandle[] = [];
  const remove = async () => {
    stopped = true;
    const results = await Promise.allSettled(handles.splice(0).map((handle) => Promise.resolve().then(() => handle.remove())));
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  };
  // Start all registrations immediately, so one slow bridge reply does not delay other subscriptions.
  const registrations = [...routes].map(async ([name, route]) => {
    const handle = await boundedListener(
      Promise.resolve().then(() =>
        events.addListener(name, (event) => {
          if (!stopped && (!events.accepts || events.accepts(event))) receive(route.destination, route.updated);
        }),
      ),
    );
    if (stopped) await handle.remove();
    else handles.push(handle);
  });
  try {
    await Promise.all(registrations);
    return { remove };
  } catch (error) {
    // Disable callbacks immediately. Late successful registrations also remove themselves.
    await remove().catch(() => {});
    throw error;
  }
};
