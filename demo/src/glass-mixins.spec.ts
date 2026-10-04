import { compileString } from 'sass';

const loadPaths = ['../src/styles/utils'];
const compile = (source: string) => compileString(source, { loadPaths, style: 'compressed' }).css;

test('overlay activated alias retains its generated styles', () => {
  expect(compile('@use "api"; .probe { @include api.glass-background-overlay-activated; }')).toBe(
    compile('@use "api"; .probe { @include api.glass-background-overlay; }'),
  );
});

test('glass-background keeps positional and named argument compatibility', () => {
  expect(compile('@use "api"; .probe { @include api.glass-background(0.1, 0, 120%, $include-border: false); }')).toBe(
    compile('@use "api"; .probe { @include api.glass-background($opacity: 0.1, $blur: 0, $saturate: 120%, $include-border: false); }'),
  );
});

test('tab accessory classic preset compiles with layout variables and an rgba progress fallback', () => {
  const css = compileString('@use "ion-tab-accessory";', {
    loadPaths: ['../src/styles/components'],
    style: 'compressed',
  }).css;
  expect(css).toContain('--ios-theme-tab-accessory-radius');
  expect(css).toContain('--ios-theme-tab-accessory-height');
  expect(css).toContain('--ios-theme-tab-accessory-inset');
  expect(css).toContain('--ios-theme-tab-accessory-thumb-size');
  expect(css).toContain('--ios-theme-tab-accessory-bottom');
  expect(css).toContain('ios-theme-tab-accessory-classic');
  expect(css).toMatch(/rgba\(var\(--ion-color-primary-rgb/);
});
