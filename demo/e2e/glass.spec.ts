import { expect, test } from '@playwright/test';
import { compileString } from 'sass';
import { resolve } from 'node:path';

const loadPaths = [resolve(__dirname, '../../src/styles/utils')];
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
