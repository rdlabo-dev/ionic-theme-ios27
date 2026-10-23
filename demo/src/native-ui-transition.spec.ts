import { expect, test, vi } from 'vitest';
import { withNativeUITransition, connectNativeUITransition } from '../../packages/theme-ios27/src/transition/native-ui';
import {
  VERTICAL_BARS_TRANSITION_CANCELED,
  getNativeSearchBindings,
  registerNativeSearch,
  setNativeUIIntegration,
} from '@rdlabo/capacitor-native-ui/integration';
import type { Animation } from '@ionic/core';
import { configureNativeTransition, enableNativeUI } from '../../packages/capacitor-native-ui/src/native';
import { iosTransitionAnimation } from '../../packages/theme-ios27/src/transition/ios.transition';

const fixture = (trackProgress = false) => {
  const doc = {} as Document;
  const page = { ownerDocument: doc } as HTMLElement;
  const calls: string[] = [];
  let ready!: () => void;
  const pending = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let finish!: Parameters<Animation['onFinish']>[0];
  setNativeUIIntegration(doc, {
    suspend: async () => {
      await pending;
      return Object.assign((canceled = false) => calls.push(`resume:${canceled}`), {
        progress: trackProgress ? (value: number) => calls.push(`native:${value}`) : undefined,
      });
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
  const wrapped = withNativeUITransition(withNativeUITransition(builder));
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
  connectNativeUITransition(animation, { ownerDocument: {} } as HTMLElement);
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
  const wrapped = withNativeUITransition(builder);
  expect(wrapped(entering, options)).toBe(animation);
  expect(builder).toHaveBeenCalledExactlyOnceWith(entering, options);
  expect(animation.duration).not.toHaveBeenCalled();
  expect(animation.easing).not.toHaveBeenCalled();
  expect(animation.play).toBe(play);
  withNativeUITransition(wrapped)(entering, options);
  expect(animation.onFinish).toHaveBeenCalledTimes(1);
});

test('a builder without navigation options remains usable', () => {
  const animation = {} as Animation;
  const builder = vi.fn(() => animation);
  expect(withNativeUITransition(builder)(document.body)).toBe(animation);
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
  const wrapped = withNativeUITransition(() => animation);
  const options = { enteringEl: entering, leavingEl: leaving, direction: 'back' as const };
  wrapped(entering, options);
  const play = animation.play;
  expect(animation.onFinish).toHaveBeenCalledTimes(1);
  const resume = vi.fn();
  const suspend = vi.fn(async () => resume);
  setNativeUIIntegration(doc, { suspend });
  try {
    wrapped(entering, options);
    wrapped(entering, options);
    expect(animation.onFinish).toHaveBeenCalledTimes(2);
    expect(animation.play).not.toBe(play);
    await animation.play();
    expect(suspend).toHaveBeenCalledExactlyOnceWith([entering, leaving], { navigation: true, direction: 'back' });
    expect(resume).toHaveBeenCalledExactlyOnceWith(false);
  } finally {
    animation.destroy();
    setNativeUIIntegration(doc);
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
  setNativeUIIntegration(doc, { suspend });
  const animation = withNativeUITransition(iosTransitionAnimation)(nav, {
    enteringEl: entering,
    leavingEl: leaving,
    duration: 123,
    easing: 'linear',
  });
  expect(animation.getDuration()).toBe(123);
  expect(animation.getEasing()).toBe('linear');
  const played = animation.play();
  expect(suspend).toHaveBeenCalledExactlyOnceWith([entering, leaving], { navigation: true });
  animation.destroy();
  ready();
  await played;
  expect(resume).toHaveBeenCalledExactlyOnceWith(true);
  setNativeUIIntegration(doc);
});

const outletTransition = () => {
  const nav = document.createElement('ion-router-outlet');
  const entering = document.createElement('main');
  const leaving = document.createElement('main');
  nav.append(entering, leaving);
  document.body.append(nav);
  const animation = iosTransitionAnimation(nav, { baseEl: nav, enteringEl: entering, leavingEl: leaving, duration: 100, easing: 'linear' });
  return { nav, animation };
};

test('destroy before playback leaves the outlet background untouched', () => {
  const { nav, animation } = outletTransition();
  try {
    nav.style.backgroundColor = 'rgb(22, 33, 44)';
    animation.destroy();
    expect(nav.style.backgroundColor).toBe('rgb(22, 33, 44)');
  } finally {
    nav.remove();
  }
});

test.each(['complete', 'cancel', 'destroy'] as const)('temporary outlet backing is restored on %s without Native UI', async (end) => {
  const { nav, animation } = outletTransition();
  try {
    animation.progressStart(true);
    animation.progressStep(0.4);
    expect(nav.style.backgroundColor).toBe('var(--ion-background-color, #fff)');
    if (end === 'destroy') animation.destroy();
    else animation.progressEnd(end === 'complete' ? 1 : 0, 0.4, 0);
    await vi.waitFor(() => expect(nav.style.backgroundColor).toBe(''));
  } finally {
    animation.destroy();
    nav.remove();
  }
});

test.each(['background-color: rgb(22, 33, 44)', 'background-image: linear-gradient(red, blue)'])(
  'navigation preserves an application stylesheet background: %s',
  (declaration) => {
    const { nav, animation } = outletTransition();
    const style = document.createElement('style');
    nav.className = 'test-outlet-background';
    style.textContent = `.test-outlet-background { ${declaration}; }`;
    document.head.append(style);
    try {
      animation.progressStart(true);
      animation.progressStep(0.4);
      expect(nav.style.backgroundColor).toBe('');
      animation.destroy();
      expect(nav.style.backgroundColor).toBe('');
    } finally {
      animation.destroy();
      nav.remove();
      style.remove();
    }
  },
);

test.each(['complete', 'cancel', 'destroy'] as const)(
  'outlet cleanup preserves an application change during playback on %s',
  async (end) => {
    const { nav, animation } = outletTransition();
    try {
      animation.progressStart(true);
      expect(nav.style.backgroundColor).toBe('var(--ion-background-color, #fff)');
      nav.style.backgroundColor = 'rgb(22, 33, 44)';
      let finished = false;
      animation.onFinish(() => (finished = true));
      if (end === 'destroy') animation.destroy();
      else {
        animation.progressEnd(end === 'complete' ? 1 : 0, 0.4, 0);
        await vi.waitFor(() => expect(finished).toBe(true));
      }
      expect(nav.style.backgroundColor).toBe('rgb(22, 33, 44)');
    } finally {
      animation.destroy();
      nav.remove();
    }
  },
);

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

  connectNativeUITransition(animation, entering, leaving);
  finish(1, animation);
  expect(cancellations).toBe(0);
  finish(0, animation);
  expect(cancellations).toBe(1);
  expect(canceledEntering).toBe(entering);
});

test('without native support the Web handle supports suspension and teardown', async () => {
  await expect(configureNativeTransition()).resolves.toEqual({ radius: 0 });
  const handle = await enableNativeUI();
  expect(handle.getStatus().state).toBe('web');
  expect(handle.getStatus().projected).toBe(0);
  const suspension = await handle.suspend();
  await suspension.resume();
  await suspension.resume();
  await handle.destroy();
  expect(handle.getStatus().state).toBe('stopped');
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

test('interactive page progress reaches the native toolbar before completion and reverses on cancellation', async () => {
  const { animation, calls, ready, finish } = fixture(true);
  animation.progressStart(true);
  animation.progressStep(0.2);
  ready();
  await expect.poll(() => calls).toEqual(['start', 'step:0.2', 'native:0.2']);
  animation.progressStep(0.6);
  animation.progressStep(0.4);
  expect(calls.slice(-4)).toEqual(['step:0.6', 'native:0.6', 'step:0.4', 'native:0.4']);
  finish(0);
  expect(calls.slice(-2)).toEqual(['native:0', 'resume:true']);
});

test('only interactive playback asks the vertical toolbar to wait for navigation to settle', async () => {
  const doc = document.implementation.createHTMLDocument();
  const entering = doc.createElement('main'),
    leaving = doc.createElement('main');
  const resume = Object.assign(vi.fn(), { finishGesture: vi.fn() });
  const suspend = vi.fn(async () => resume);
  setNativeUIIntegration(doc, { suspend });
  const animation = {
    onFinish: vi.fn(),
    play: vi.fn(async () => {}),
    progressStart: vi.fn(),
    progressStep: vi.fn(),
    progressEnd: vi.fn(),
    destroy: vi.fn(),
  } as unknown as Animation;
  connectNativeUITransition(animation, entering, leaving, 'back');
  animation.progressStart(true);
  animation.progressEnd(1, 0.8, 100);
  await vi.waitFor(() =>
    expect(suspend).toHaveBeenCalledExactlyOnceWith([entering, leaving], { navigation: true, direction: 'back', interactive: true }),
  );
  await vi.waitFor(() => expect(resume.finishGesture).toHaveBeenCalledExactlyOnceWith(true));
  animation.destroy();
  await vi.waitFor(() => expect(resume).toHaveBeenCalledWith(true));
  setNativeUIIntegration(doc);
});
