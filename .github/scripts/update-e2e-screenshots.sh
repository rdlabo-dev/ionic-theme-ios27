#!/usr/bin/env bash
set -euo pipefail

npm ci
npm run build

npm ci --prefix demo
IONIC_MAJOR=9 npm run --prefix demo test:e2e -- e2e/screenshot.spec.ts e2e/adaptive-tab-bar.spec.ts --update-snapshots
