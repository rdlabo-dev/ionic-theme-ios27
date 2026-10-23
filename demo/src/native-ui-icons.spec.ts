import { afterEach, expect, test, vi } from 'vitest';
import { createIconRenderer } from '../../packages/capacitor-native-ui/src/native/shared/icons';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const fixture = () => {
  const pending: { resolve: () => void; reject: (error: Error) => void }[] = [];
  vi.stubGlobal(
    'Image',
    class {
      src = '';
      decode() {
        return new Promise<void>((resolve, reject) => pending.push({ resolve, reject }));
      }
    },
  );
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:icon');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage() {} } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,rendered');
  return { renderer: createIconRenderer(), pending, revoke };
};

test('concurrent identical icons share decoding while dimensions remain distinct', async () => {
  const { renderer, pending, revoke } = fixture();
  const images = [renderer.render('svg', 24, 24), renderer.render('svg', 24, 24), renderer.render('svg', 32, 32)];
  expect(pending).toHaveLength(2);
  pending.forEach((image) => image.resolve());
  await expect(Promise.all(images)).resolves.toEqual(['rendered', 'rendered', 'rendered']);
  await renderer.render('svg', 24, 24);
  expect(pending).toHaveLength(2);
  expect(revoke).toHaveBeenCalledTimes(2);
});

test('failed decoding can retry and clearing during decoding does not restore stale cache', async () => {
  const { renderer, pending, revoke } = fixture();
  const failed = renderer.render('svg', 24, 24);
  const assertion = expect(failed).rejects.toThrow('decode');
  pending[0].reject(new Error('decode'));
  await assertion;
  const retry = renderer.render('svg', 24, 24);
  expect(pending).toHaveLength(2);
  renderer.clear();
  pending[1].resolve();
  await retry;
  const fresh = renderer.render('svg', 24, 24);
  expect(pending).toHaveLength(3);
  pending[2].resolve();
  await fresh;
  expect(revoke).toHaveBeenCalledTimes(3);
});
