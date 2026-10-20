import { expect, test } from 'vitest';
import { defineNativeUI, enableNativeUI } from '../../packages/capacitor-native-ui/src/native';

const counter = () => defineNativeUI({ name: 'app.counter', selector: '[data-counter]', read: () => ({ props: { count: 0 } }) });

test('local extensions are stable configuration and require teardown before replacement', async () => {
  const extension = counter();
  const first = await enableNativeUI({ extensions: [extension] });
  try {
    expect(await enableNativeUI({ extensions: [extension] })).toBe(first);
    await expect(enableNativeUI({ extensions: [counter()] })).rejects.toThrow('different controls');
    await expect(enableNativeUI()).rejects.toThrow('different controls');
  } finally {
    await first.destroy();
  }
  const replacement = await enableNativeUI({ extensions: [counter()] });
  await replacement.destroy();
});

test('duplicate names and invalid selectors reject before acquiring shell resources', async () => {
  await expect(enableNativeUI({ extensions: [counter(), counter()] })).rejects.toThrow('unique');
  await expect(enableNativeUI({ extensions: [{ ...counter(), selector: '[' }] })).rejects.toThrow();
  const handle = await enableNativeUI({ extensions: [counter()] });
  await handle.destroy();
});
