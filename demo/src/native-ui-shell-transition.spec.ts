import { expect, test, vi } from 'vitest';
import { withNativeUIShellTransition } from '../../src/vertical-bars';
import {
  connectNativeUIShellTransition,
  VERTICAL_BARS_TRANSITION_CANCELED,
  getNativeSearchBindings,
  registerNativeSearch,
  setNativeUIShellIntegration,
} from '../../src/native-integration';
import type { Animation } from '@ionic/core';
import { configureNativeTransition, enableNativeUIShell } from '../../src/native';
import { iosTransitionAnimation } from '../../src/transition/ios.transition';

const fixture = () => {
  const doc = {} as Document;
  const page = { ownerDocument: doc } as HTMLElement;
  const calls: string[] = [];
  let ready!: () => void;
  const pending = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let finish!: Parameters<Animation['onFinish']>[0];
  setNativeUIShellIntegration(doc, {
    suspend: async () => {
      await pending;
      return (canceled = false) => calls.push(`resume:${canceled}`);
    },
  });
  const animation = {
    onFinish: (callback: typeof finish) => {
      finish = callback;
      return animation;
    },
    play: async () => {
      calls.push('play');
    },
    progressStart: () => {
      calls.push('start');
      return animation;
    },
    progressStep: (step: number) => {
      calls.push(`step:${step}`);
      return animation;
    },
    progressEnd: (end: number) => {
      calls.push(`end:${end}`);
      return animation;
    },
    destroy: () => {
      calls.push('destroy');
      return animation;
    },
  } as unknown as Animation;
  const builder = vi.fn(() => animation);
  const wrapped = withNativeUIShellTransition(withNativeUIShellTransition(builder));
  expect(wrapped(page, { enteringEl: page })).toBe(animation);
  expect(builder).toHaveBeenCalledExactlyOnceWith(page, { enteringEl: page });
  return { animation, calls, ready, finish: (step: 0 | 1) => finish(step, animation) };
};

test('normal transition waits for native suspension', async () => {
  const { animation, calls, ready } = fixture();
  const played = animation.play();
  expect(calls).toEqual([]);
  ready();
  await played;
  expect(calls).toEqual(['play', 'resume:false']);
});

test('interactive cancellation queued during suspension keeps the last progress', async () => {
  const { animation, calls, ready, finish } = fixture();
  animation.progressStart(true);
  animation.progressStep(0.2);
  animation.progressStep(0.4);
  animation.progressEnd(0, 0.4, 100);
  expect(calls).toEqual([]);
  ready();
  await expect.poll(() => calls).toEqual(['start', 'step:0.4', 'end:0']);
  finish(0);
  expect(calls).toEqual(['start', 'step:0.4', 'end:0', 'resume:true']);
  animation.destroy();
  expect(calls).toEqual(['start', 'step:0.4', 'end:0', 'resume:true', 'destroy']);
});

test('destroy during bridge preparation cannot start an abandoned transition', async () => {
  const { animation, calls, ready } = fixture();
  const played = animation.play();
  animation.destroy();
  ready();
  await played;
  expect(calls).toEqual(['destroy', 'resume:true']);
});

test('without native enablement the animation remains untouched', () => {
  const animation = { play: async () => {} } as Animation;
  const play = animation.play;
  connectNativeUIShellTransition(animation, { ownerDocument: {} } as HTMLElement);
  expect(animation.play).toBe(play);
});

test('the adapter preserves builder options and animation settings without a runtime', () => {
  const entering = document.createElement('main');
  const leaving = document.createElement('main');
  const animation = {
    onFinish: vi.fn(),
    play: vi.fn(),
    duration: vi.fn(),
    easing: vi.fn(),
  } as unknown as Animation;
  const builder = vi.fn(() => animation);
  const options = { enteringEl: entering, leavingEl: leaving, direction: 'back', duration: 123 };
  const play = animation.play;
  const wrapped = withNativeUIShellTransition(builder);
  expect(wrapped(entering, options)).toBe(animation);
  expect(builder).toHaveBeenCalledExactlyOnceWith(entering, options);
  expect(animation.duration).not.toHaveBeenCalled();
  expect(animation.easing).not.toHaveBeenCalled();
  expect(animation.play).toBe(play);
  withNativeUIShellTransition(wrapped)(entering, options);
  expect(animation.onFinish).toHaveBeenCalledTimes(1);
});

test('a builder without navigation options remains usable', () => {
  const animation = {} as Animation;
  const builder = vi.fn(() => animation);
  expect(withNativeUIShellTransition(builder)(document.body)).toBe(animation);
  expect(builder).toHaveBeenCalledExactlyOnceWith(document.body, undefined);
});

test('connecting before runtime startup does not prevent later native integration', async () => {
  const doc = document.implementation.createHTMLDocument();
  const entering = doc.createElement('main');
  const leaving = doc.createElement('main');
  const animation = {
    onFinish: vi.fn(),
    play: vi.fn(async () => {}),
    progressStart: vi.fn(),
    progressStep: vi.fn(),
    progressEnd: vi.fn(),
    destroy: vi.fn(),
  } as unknown as Animation;
  const wrapped = withNativeUIShellTransition(() => animation);
  const options = { enteringEl: entering, leavingEl: leaving };
  wrapped(entering, options);
  const play = animation.play;
  expect(animation.onFinish).toHaveBeenCalledTimes(1);
  const resume = vi.fn();
  const suspend = vi.fn(async () => resume);
  setNativeUIShellIntegration(doc, { suspend });
  try {
    wrapped(entering, options);
    wrapped(entering, options);
    expect(animation.onFinish).toHaveBeenCalledTimes(2);
    expect(animation.play).not.toBe(play);
    await animation.play();
    expect(suspend).toHaveBeenCalledExactlyOnceWith([entering, leaving]);
    expect(resume).toHaveBeenCalledExactlyOnceWith(false);
  } finally {
    animation.destroy();
    setNativeUIShellIntegration(doc);
  }
});

test('the built-in iOS transition uses the adapter once even when wrapped again', async () => {
  const doc = document.implementation.createHTMLDocument();
  const nav = doc.createElement('ion-nav');
  const entering = doc.createElement('main');
  const leaving = doc.createElement('main');
  nav.append(entering, leaving);
  doc.body.append(nav);
  let ready!: () => void;
  const pending = new Promise<void>((resolve) => (ready = resolve));
  const resume = vi.fn();
  const suspend = vi.fn(async () => {
    await pending;
    return resume;
  });
  setNativeUIShellIntegration(doc, { suspend });
  const animation = withNativeUIShellTransition(iosTransitionAnimation)(nav, {
    enteringEl: entering,
    leavingEl: leaving,
    duration: 123,
    easing: 'linear',
  });
  expect(animation.getDuration()).toBe(123);
  expect(animation.getEasing()).toBe('linear');
  const played = animation.play();
  expect(suspend).toHaveBeenCalledExactlyOnceWith([entering, leaving]);
  animation.destroy();
  ready();
  await played;
  expect(resume).toHaveBeenCalledExactlyOnceWith(true);
  setNativeUIShellIntegration(doc);
});

test('a canceled Web transition releases the still-active leaving page', () => {
  const doc = document.implementation.createHTMLDocument();
  const app = doc.createElement('ion-app');
  doc.body.append(app);
  const entering = doc.createElement('main');
  const leaving = doc.createElement('main');
  app.append(entering, leaving);
  let finish!: Parameters<Animation['onFinish']>[0];
  const animation = { onFinish: (callback: typeof finish) => (finish = callback) } as unknown as Animation;
  let cancellations = 0;
  let canceledEntering: HTMLElement | undefined;
  leaving.addEventListener(VERTICAL_BARS_TRANSITION_CANCELED, (event) => {
    cancellations++;
    canceledEntering = (event as CustomEvent<{ entering: HTMLElement }>).detail.entering;
  });

  connectNativeUIShellTransition(animation, entering, leaving);
  finish(1, animation);
  expect(cancellations).toBe(0);
  finish(0, animation);
  expect(cancellations).toBe(1);
  expect(canceledEntering).toBe(entering);
});

test('server rendering has no DOM side effects', async () => {
  await expect(configureNativeTransition()).resolves.toEqual({ radius: 0 });
  const handle = await enableNativeUIShell();
  expect(handle.getStatus().state).toBe('web');
  expect(handle.getStatus().projected).toBe(0);
  const suspension = await handle.suspend();
  await suspension.resume();
  await suspension.resume();
  await handle.destroy();
  const disabled = await enableNativeUIShell({ enabled: false, controls: { tabs: true } });
  expect(disabled.getStatus()).toMatchObject({ state: 'web', reason: 'Disabled' });
  await disabled.destroy();
});

test('re-registering a cached search footer replaces its binding without waiting for GC', () => {
  const doc = {} as Document;
  const tabBar = { ownerDocument: doc } as HTMLElement;
  const footer = {} as HTMLElement;
  const trigger = {} as HTMLElement;
  const retained = [];
  for (let entry = 0; entry < 20; entry++) {
    const current = registerNativeSearch(tabBar, trigger, footer);
    retained.push(current); // Keep old bindings alive to rule out garbage collection.
    expect(getNativeSearchBindings(doc)).toEqual([current]);
  }
  const second = registerNativeSearch(tabBar, trigger, {} as HTMLElement);
  expect(getNativeSearchBindings(doc)).toEqual([retained.at(-1), second]);
});
