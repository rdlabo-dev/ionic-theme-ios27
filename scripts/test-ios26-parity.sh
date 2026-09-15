#!/bin/sh
# Optional browser paths allow a system-extracted, version-pinned Playwright
# browser to be used without changing the user's shared browser installation.
set -eu
export PARITY_CHROMIUM_PATH=${1:?Pass Chromium executable path}
export PARITY_WEBKIT_PATH=${2:?Pass WebKit pw_run.sh path}
shift 2
repo=$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo/demo"
exec npx playwright test --config native-parity/playwright.config.ts "$@"
