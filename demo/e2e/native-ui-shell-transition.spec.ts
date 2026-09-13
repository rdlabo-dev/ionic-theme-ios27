import { expect, test } from '@playwright/test';
import {
  connectNativeUIShellTransition,
  getNativeSearchBindings,
  registerNativeSearch,
  setNativeUIShellIntegration,
} from '../../src/native-integration';
import type { Animation } from '@ionic/core';
import { enableNativeUIShell } from '../../src/native';

const fixture = () => {
  const doc = {} as Document;
  const page = { ownerDocument: doc } as HTMLElement;
  const calls: string[] = [];
  let ready!: () => void;
  const pending = new Promise<void>((resolve) => {
    ready = resolve;
  });
  setNativeUIShellIntegration(doc, {
    suspend: async () => {
      await pending;
      return () => calls.push('resume');
    },
  });
  const animation = {
    onFinish: () => animation,
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
  connectNativeUIShellTransition(animation, page);
  return { animation, calls, ready };
};

test('normal transition waits for native suspension', async () => {
  const { animation, calls, ready } = fixture();
  const played = animation.play();
  expect(calls).toEqual([]);
  ready();
  await played;
  expect(calls).toEqual(['play', 'resume']);
});

test('interactive cancellation queued during suspension keeps the last progress', async () => {
  const { animation, calls, ready } = fixture();
  animation.progressStart(true);
  animation.progressStep(0.2);
  animation.progressStep(0.4);
  animation.progressEnd(0, 0.4, 100);
  expect(calls).toEqual([]);
  ready();
  await expect.poll(() => calls).toEqual(['start', 'step:0.4', 'end:0']);
  animation.destroy();
  expect(calls).toEqual(['start', 'step:0.4', 'end:0', 'resume', 'destroy']);
});

test('destroy during bridge preparation cannot start an abandoned transition', async () => {
  const { animation, calls, ready } = fixture();
  const played = animation.play();
  animation.destroy();
  ready();
  await played;
  expect(calls).toEqual(['destroy', 'resume']);
});

test('without native enablement the animation remains untouched', () => {
  const animation = { play: async () => {} } as Animation;
  const play = animation.play;
  connectNativeUIShellTransition(animation, { ownerDocument: {} } as HTMLElement);
  expect(animation.play).toBe(play);
});

test('server rendering has no DOM side effects', async () => {
  const handle = await enableNativeUIShell();
  expect(handle.getStatus().state).toBe('web');
  expect(handle.getStatus().projected).toBe(0);
  await handle.destroy();
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
