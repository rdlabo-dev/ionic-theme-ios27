import { expect, test } from 'vitest';
import { defineNativeUI, enableNativeUIShell } from '../../packages/capacitor-native-ui/src/native';

const counter = () => defineNativeUI({ name: 'app.counter', selector: '[data-counter]', read: () => ({ props: { count: 0 } }) });

test('local extensions are stable configuration and require teardown before replacement', async () => {
  const extension = counter();
  const first = await enableNativeUIShell({ extensions: [extension] });
  try {
    expect(await enableNativeUIShell({ extensions: [extension] })).toBe(first);
    await expect(enableNativeUIShell({ extensions: [counter()] })).rejects.toThrow('different controls');
    await expect(enableNativeUIShell()).rejects.toThrow('different controls');
  } finally {
    await first.destroy();
  }
  const replacement = await enableNativeUIShell({ extensions: [counter()] });
  await replacement.destroy();
});

test('duplicate names and invalid selectors reject before acquiring shell resources', async () => {
  await expect(enableNativeUIShell({ extensions: [counter(), counter()] })).rejects.toThrow('unique');
  await expect(enableNativeUIShell({ extensions: [{ ...counter(), selector: '[' }] })).rejects.toThrow();
  const handle = await enableNativeUIShell({ extensions: [counter()] });
  await handle.destroy();
});
