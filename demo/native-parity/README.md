# iOS 26 native measurements

The reference is the running iOS 26 UIKit implementation. iOS 27 history supplies
the measurement technique and test cases, never the expected iOS 26 values.

`recovered/` preserves earlier measurement sources and their provenance.
`probe/` provides repeatable native/Web samples with the same input content,
appearance and background. Reference output must include the runtime build and
device; screenshots from different runtimes are not interchangeable baselines.

Theme sources remain at their iOS 26 baseline until a native/Web measurement
identifies a difference. In particular, the iOS 26 prominent-button brightness
palette is part of the target appearance and remains supported.

Use the iOS 26 branch's CSS and JavaScript when measuring Web output. Do not load
iOS 27 CSS in a fixture merely because its native shell came from main.

## Reproduce

From the repository root, install root/demo dependencies with `npm ci` in each
directory. Xcode 26 with an iOS 26 runtime, XcodeGen, Node and Python 3 with
NumPy/Pillow/Matplotlib are required. Use an explicit booted Simulator UDID:

```sh
sh scripts/verify-ios26-parity.sh SIMULATOR_UDID
# Or select a bounded sequence:
sh scripts/verify-ios26-parity.sh SIMULATOR_UDID \
  -only-testing:NativeParityTests/NativeParityTests/testSegment \
  -only-testing:NativeParityTests/NativeParityTests/testShellSegment
python3 demo/native-parity/report.py ARTIFACT_DIR
python3 demo/native-parity/report.py ARTIFACT_DIR --reference shell
```

The runner prints a fresh artifact directory and preserves Xcode/runtime data,
the source diff and source archive (including new files), bundled JavaScript/CSS
and hashes, actual Ionic version, `.xcresult`, screenshots and raw frame samples.
Documents from older installations are filtered by the build envelope. A passing
driver is followed by `validate-artifacts.mjs`, which rejects missing/stale
geometry and input records. The archive excludes build output and credential-like
files; review artifacts before sharing them outside the workspace.
Keep this directory alongside the report; images alone are not reproducible
evidence. UIKit tests succeeding only confirms the interaction driver completed,
not pixel/motion parity. Read `WORKLOG.md` for residual differences and invalid
early runs.

`report.py` also emits all five short-button curves with actual pointer hold
durations. Do not equate XCTest's requested duration with the observed duration,
or compensate native/Web traces with an unreported fitted time shift. The recorder
walks layout trees and serializes data; frame gaps and recording overhead must be
reviewed before using a trace for timing acceptance. Navigation and overlays use
full-viewport diagnostic comparisons; control fixtures use a cropped strip.

### Tab measurements

`testTabsController` measures an independent UIKit three-item controller;
`testTabsMotion` compares a standalone three-item bar with Web, including a
selected hold, four transfer durations and two drag velocities. It asserts the
selected item after transfers. The validator also requires exactly seven Web
click events, not just seven pointer sequences. `testShellTabs` exercises the
pinned reference shell on the selected iOS26 runtime.

Tab recordings are now flushed once after interaction via a test-only Darwin
notification, with a saved-data acknowledgement. Periodically serializing the
growing record caused 100–300ms stalls in earlier runs. Other probes retain
their existing recording behavior. The source archive and raw timestamps make
this change distinguishable from earlier measurements.

`report.py` emits `tabs-motion-{light,dark}.png` and `tabs-motion.json`. Lens
dimensions/center are expressed in unscaled platter coordinates. Actual
pointerup times are marked; intervals with gaps over50ms are not joined by a
smooth line. Static geometry, tap/hold motion and velocity-dependent drag
fidelity are separate acceptance dimensions. See the latest WORKLOG checkpoint
for what is measured versus still a candidate.

Browser regressions use `demo/native-parity/playwright.config.ts`. With normal
Playwright browser installations, run from `demo`:

```sh
npx playwright test --config native-parity/playwright.config.ts ios26- toggle.spec
IONIC_MAJOR=8 npx playwright test --config native-parity/playwright.config.ts ios26- toggle.spec
```

`IONIC_MAJOR` selects the demo adapter, not the installed dependencies. For the
Ionic 8 run, install the actual CI matrix packages in both root and demo first:

```sh
npm install --no-save --package-lock=false @ionic/angular@8.8.19 @ionic/core@8.8.19
npm install --no-save --package-lock=false --prefix demo @ionic/angular@8.8.19 @ionic/core@8.8.19 @rdlabo/eslint-plugin-rules@21.3.0
```

Use `npm ci` in both directories to return to the lockfile versions. Do not make
the Ionic 8 adapter import Ionic 9 just to make the compatibility test compile.
This dedicated config limits discovery to the parity specs. Existing screenshot
baselines run separately with `demo/playwright.config.ts`; intentional visual
changes require native comparison and human review before updating those images.

For explicitly managed executables, `scripts/test-ios26-parity.sh` takes the
Chromium executable and WebKit `pw_run.sh` as its first two arguments, then
forwards remaining Playwright arguments. It does not alter shared browser caches.

Shell component sources are pinned to main (see `reference-shell/README.md`).
The probe projects button/segment/tabs on top of WKWebView. It does not yet test
the complete Capacitor bridge, route handoff, navigation or overlays, and no
iOS 26 physical-device result is currently available.
