#!/usr/bin/env bash
set -euo pipefail

npm ci
npm run build

npm ci --prefix demo
IONIC_MAJOR=9 npm --prefix demo run test:e2e:update -- e2e/screenshot.spec.ts

npm install --no-save --package-lock=false @ionic/angular@8.8.19 @ionic/core@8.8.19
npm run build
npm install --no-save --package-lock=false --prefix demo @ionic/angular@8.8.19 @ionic/core@8.8.19
IONIC_MAJOR=8 npm --prefix demo run test:e2e -- e2e/screenshot.spec.ts
