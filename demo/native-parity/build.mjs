import { build } from 'esbuild';
import { compile } from 'sass';
import { mkdir, copyFile, writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = resolve(here, '../..');
const output = resolve(here, 'probe/www');
const require = createRequire(import.meta.url);
await mkdir(output, { recursive: true });
await build({ entryPoints: [resolve(here, 'probe/entry.ts')], bundle: true, format: 'iife', outdir: output });
const css = ['default-variables.scss', 'ionic-theme-ios26.scss', 'ionic-theme-ios26-dark-class.scss']
  .map((name) => compile(resolve(repo, 'src/styles', name)).css)
  .join('\n');
await writeFile(resolve(output, 'theme.css'), css);
await copyFile(resolve(here, 'probe/index.html'), resolve(output, 'index.html'));
await writeFile(
  resolve(output, 'build.json'),
  JSON.stringify(
    {
      builtAt: new Date().toISOString(),
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
      ionicCore: require('@ionic/core/package.json').version,
      themeSha256: createHash('sha256').update(css).digest('hex'),
      scriptSha256: createHash('sha256')
        .update(await readFile(resolve(output, 'entry.js')))
        .digest('hex'),
      ionicCssSha256: createHash('sha256')
        .update(await readFile(resolve(output, 'entry.css')))
        .digest('hex'),
    },
    null,
    2,
  ),
);
