# iOS 26 native parity

## Scope

Bring the iOS 26 Web theme to the measured visual and interaction quality of main
`2445b7c`, starting from iOS 26 `f187d7f`. Retain the iOS 26 package name, CSS
entry points, release branch, and public customization contract. Native UI Shell
is a verification reference; publishing a new native API is outside this change.

## Evidence ledger

Each row requires native measurement, implementation, and verification. Porting
the iOS 27 implementation alone does not establish iOS 26 parity.

| Area                                       | Source PRs    | Implementation                                                                | iOS 26 evidence                                                                                 |
| ------------------------------------------ | ------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Shared glass, header, toolbar              | 139, 140, 162 | Plain toolbar / single-button sizing corrected; scrolling material pending    | 26.1/26.5 navigation fixture; 116pt header +52pt large title, single button44pt high            |
| Buttons, back button, FAB                  | 141, 149      | Button material candidate; optional size-aware motion in progress             | 26.5 button size matrix recorded; back/FAB pending                                              |
| Push/back and cancelled gestures           | 142           | Independent native/Web driver; production motion unchanged                    | Push/pop and80pt/s cancel pass26.1;250pt/s held release differs; curves pending                 |
| Searchbar and searchable tabs              | 149, 163      | Search field geometry/material corrected; searchable tabs pending             | 26.5 native minimal search field; 10 browser cases passed                                       |
| Toggle short/held presses                  | 150           | Candidate; curves iterating                                                   | 26.5 size/motion recorded; browser regression passed                                            |
| Segment tap/drag and surface               | 151, 161      | Visual-only engine; 31/48pt variants; measured tap curves                     | Native/Web/Shell comparison on 26.5; 18 browser cases passed; hold/drag curves still candidates |
| Tab transfer/drag/release and geometry     | 152, 163      | Lifecycle/cancel/duplicate click fixes; motion/geometry pending               | 16 browser cases passed; raw native curves recorded                                             |
| Sidebar and grouped lists                  | 156           | Inset list rows/spacing/radius corrected; sidebar pending                     | Native group(20,168,362,424.067) vs Web(20,168,362,424); separators/text residuals              |
| Range and dual endpoints                   | 157           | Single press/geometry candidate; dual regression passed                       | 26.1/26.5 geometry; 20 browser cases passed; velocity-dependent deformation pending             |
| Alerts, action sheets, toast, modal        | 158           | Static geometry + optional measured enter/leave builders; toast/modal pending | Alert320×172 exact; sheet320×263.984 vs264;26 browser cases passed; materials/latency residuals |
| Cards and child opt-outs                   | 159           | Nested selector leaks fixed; existing 26 values retained                      | 24 browser cases passed within current suite; card material pending                             |
| Popover shape, anchor and animation origin | 160           | Trigger/event/pane placement and style restoration fixed                      | 16 browser cases passed; native shape/motion pending                                            |
| Native/Web comparison and handoff          | 153, 154, 163 | UIKit/Web/Shell projection harness                                            | Three shell components run on 26.5; full bridge/handoff pending                                 |

## Validation protocol

- Pin native reference revision, Xcode/SDK, runtime build, device, display scale,
  appearance, content, background, font size, and input sequence.
- Compare independent UIKit controls, the native shell, and Web rendering.
  Shell geometry/font values can originate in the DOM and are not an independent
  assertion of UIKit defaults.
- Record raw absolute geometry and time-series motion as well as normalized
  curves. Align samples to input events, not a fitted temporal offset.
- Cover short taps, held presses, low/high-speed drags, interruption, cancellation,
  repeated activation, and reduced motion.
- Check iPhone/iPad, iOS 26.1/26.5, light/dark, RTL, keyboard, and rotation.
- Compare contours, text, material, and shadows separately. Retain the unmasked
  images and identify any unavoidable rendering differences.
- Run Ionic 8/9 functional and screenshot regressions; verify WKWebView on iOS.
- No claim of physical-device validation until an actual device run succeeds.

## Environment

## Corrected implementation order (2026-09-15)

The initial bulk port was reverted completely. `git diff --exit-code ios26 -- src
demo` passed before measurement work resumed. iOS 26 brightness colors, labels,
structure, and motion are the target; iOS 27 code is only a candidate after a
corresponding iOS 26 discrepancy has been measured.

Native iPhone 17 Pro, iOS 26.5 (23F77), Xcode 26.6 measurements:

- 140 × 44pt glass/prominent buttons: held scale 1.1142857; peak about 1.1234
  around 200–216ms. This is a controlled-width case, not intrinsic button sizing.
- UISwitch: track 63 × 28pt, resting handle 37 × 24pt. Baseline theme uses 64pt
  and 38pt respectively. Held/tap motion reaches roughly 61 × 40pt at its peak.
- UISlider: resting thumb 37 × 24pt (not the iOS 27 theme's 38pt width).
- Standalone UISegmentedControl: track 31pt, selected surface 27pt with 2pt inset.
  Shell projection at a 48pt DOM frame produces a 44pt selected lens; track does
  not scale. A real navigation-toolbar context is not yet independently measured.
- Standalone three-item UITabBar: platter 274 × 62pt, selection 94 × 54pt.
  Controller-managed full-width bars require a separate measurement.

The v2 probe passed six interaction cases but omitted light-theme default
variables and used a mismatched dark background on Web. Its native measurements
are useful; its Web material screenshots are not valid parity baselines.
The corrected runner is collecting replacement evidence.

## Current evidence (2026-09-15)

Artifacts are under `/private/tmp/ios26-native-parity.<suffix>`:

- `KDPID1`: six XCUITests passed (xcresult summary), but runner was edited while
  running and its shell exit/log are invalid. Web dark background mismatched;
  missing `ion-app` prevented button tap activation. Do not use motion as parity.
- `GYJskT`: button/range baseline with `ion-app` and correct backgrounds; passed.
- `mtSQiG`: first toggle candidate from main; clear delayed/second expansion.
- `c2hNxg`, `VY7PaQ`, `qj9yqf`: iOS 26-specific toggle iterations; passed
  XCUITest interaction drivers, which are not motion-error acceptance tests.
- `P0P2QT`: single range press candidate; onset and held dimensions much closer.
  Native drag-dependent deformation is still not reproduced by the CSS curve.
- `qDtIXO`: button material candidate exposed background clipping regression;
  fixed with a separate border-box background layer; rerun below.
- `Ea4k1s`: button plus three Shell component cases passed. Native/Shell button
  fill/rim matched in the sampled cross-sections; Web material still iterating.
- `kjOhTB`: six cases passed, updated button material and old segment/tabs
  baseline. Shell uses the same DOM frame but UIKit may size its own platter.
- `WGb7ng`: iOS 26.1 toggle/range interaction cases passed. Native track/handle
  and slider thumb dimensions match the 26.5 measurements.
- `FSpkxf`: content segment Native/Web/Shell cases passed. Track 320×31pt, lens
  27pt high. Native lens 102pt vs Web 102.66pt; font rasterization and fractional
  horizontal layout still differ. Selected surface/track colors now much closer.
  Updated 31pt and 48pt tap curves preserve actual pointerup-relative times;
  the original candidate used the wrong vertical rebound for the 31pt variant.
- `az8nIM`: native button matrix passed. Widths 44/80/220 at height 44, and
  80×28, all expand by 16pt horizontally, with uniform scale. 180×62 instead
  expands by 14.13793pt; large-size motion must not assume the smaller rule.

`IDW5HW` is invalid: wrong Xcode test target, no tests ran. Do not count it.

Chrome 145 and Playwright WebKit 26.0: 28 brightness/toggle regressions passed
each. Later source changes require another run. These check behavior, not pixel
or temporal equality. Brightness tests now include implicit and explicit primary.

`report.py` splits space-separated CSS part names (e.g. `knob pressed`), compares
unregistered screenshot ROIs, and rejects stale Simulator Documents from other
builds. Whole-ROI RGB MAE is diagnostic only, not a parity threshold. The runner
preserves raw samples, screenshots, Xcode/runtime info, theme CSS and build hash.

The connected physical iPhone runs iOS 27.0, not 26. No iOS 26 physical-device
validation has occurred. Availability was asked; simulator work continues.

### Subsequent measurements and regression runs

- `6a5xS5`: Segment/ShellSegment/Search interaction drivers passed; segment uses
  revised 31/48pt curves. Native search host56pt, field44pt, radius22, inline
  padding8pt; the clear button remains **inside** the field on iOS 26.
- `RBs9rr`: Button/Search/Alert passed; ActionSheet failed because the fixture
  specified sourceView on iPhone, which presents an anchored callout without
  the expected Cancel button. This is a fixture mismatch, not a theme failure.
- `MlKHbV` (26.5), `ondT6o` (26.1): Alert and unanchored ActionSheet passed.
  Both runtimes: alert320×172pt, sheet320×264pt, radius34pt; center at201,451 in
  a402×874 viewport with62/34pt safe areas. The unanchored sheet is **centered**;
  the old theme's bottom sheet is not this UIKit presentation. Anchored/iPad
  presentations are separate cases and remain unqualified.
- `4SaJQq`: five short button presses passed, native/Web light/dark. The old
  optional200ms minimum press over-expanded short taps. Replaced by a damped
  spring with current velocity carried into release, fit to native light data.
  Press frequency20.43633/damping0.611883/onset13.659ms; release16.99576/
  0.563006/onset14.996ms. Held scale remains(width+16)/width for qualified sizes.
  Fit width RMSE0.114pt; separate dark/held native traces0.06–0.49pt. These are
  **model-to-native** errors, not Web rendering parity results.
- `WlrEH6`, `ZPXFJo`: rendered short-press reruns exposed an additional WAAPI
  frame delay/stale timeline during velocity handoff. Driver passed, visual
  residuals remain; exact input-clock anchoring is undergoing another run.
- `XMqwlm`: first overlay CSS run passed drivers but exposed remaining line
  height rounding and missing action-sheet flex placement; fixed afterwards.
- Dedicated browser suite: **180/180 passed** on Chromium/WebKit before the
  latest overlay/clock refinements. Overlay specs are now tested separately.
  An earlier overly broad path filter also ran old screenshot baselines:
  action-sheet:button-only, segment, breadcrumbs differed (3 failed,76 passed,
  remainder stopped). No baseline images were silently updated.
- First Ionic8 attempt did not compile because dependencies were still Ionic9.
  Cursor Auto diagnosed this; its suggestion to relabel Ionic9 as8 was rejected.
  Use the actual existing CI dependency matrix instead.

Reference shell Swift sources are exact blobs from main
`2445b7cff71bec3f815c4071281c40b0de1b1109`, verification-only. Component projection
tests do not establish Capacitor bridge, handoff, navigation, or overlay parity.

### Latest checkpoint: native measurements, not full acceptance

- `b6TT1k`: corrected button clock and border-box ResizeObserver. Dark press no
  longer cancels when the activated border changes the content box. All five
  short presses are charted by `report.py`, including actual input holds. For
  the light116ms case, native peak155.332pt at150.12ms vs Web155.224pt at148ms.
  The65.54ms native /80ms Web first press is **not** an equal-stimulus comparison.
- `3vg4c1`: alert320×172pt at(41,365) matches Web; action-sheet Web263.984pt high
  vs native264pt at(41,319). These are outer geometry results, not pixel parity.
- `Rj9edn`: navigation screenshot/driver passed, but Web metric export was
  missing. SVG `className` is an SVGAnimatedString and poisoned bridge payloads;
  changed the recorder to `getAttribute('class')`. Do not cite the missing traces.
- `zrJd0O`: Web recorder fixed. A stronger `isHittable` cancellation assertion
  exposed a real difference: XCTest `.slow` means250pt/s and can cross Ionic's
  0.2px/ms completion threshold despite a held release. The low-speed case now
  explicitly uses80pt/s. The250pt/s case remains a known unresolved discrepancy,
  not a passing cancellation test. Production navigation motion is unchanged.
- `KVTF7j`: iOS26.1, actual Ionic9.0.0: Alert/ActionSheet/Navigation drivers all
  passed, as did current-build geometry/input validation for all12 combinations.
  Single plain navbar button Web68.266×44pt vs native68.667×44; list begins168pt
  in both renderers, Web424pt total height vs native424.067. Native/Web text
  rasterization, separator appearance and background fades still differ.
- Overlay response: opacity and enter scale share a critically damped response,
  frequency22.85/s,416.667ms settling window, scale1.2→1; leave fades at scale1.
  Independent26.1/26.5 fits give22.80–22.86/s. New optional builders are wired in
  the demo/probe, preserve opt-outs and reduced motion, and passed26 browser cases.
  UIKit construction-to-first-frame latency was approximately100–145ms and is
  **not** added as an arbitrary Web delay. Thus input-to-pixel timing is not yet
  equivalent even where the response shape matches. Native cancel-button press
  also briefly deforms the dialog; this is not implemented by the leave builder.
- True Ionic8.8.19 dependency run:198/198 browser cases passed before the latest
  header/list/overlay additions. True Ionic9.0.0 run:198 passed,2 test-fixture
  failures from a synthetic pointercancel missing pointerId. Corrected to the
  active pointerId;40 tab/child-opt-out cases subsequently passed. Later focused
  header/list/button/brightness run:56/56 passed. Full latest matrix follows.
- Runner now records source.tar.gz (including untracked engines/probes), bundled
  JS/CSS and their hashes plus the actual Ionic core version. It fails if a named
  screenshot has missing/stale geometry or input data; this detects the Rj9edn
  failure. The report now charts all five short presses and navigation screenshots.
- Cursor Auto was used for bounded test/probe scaffolding and patch suggestions.
  Suggestions were reviewed before applying; measurement interpretation and
  production behavior were not delegated. No package names/versions/locks changed.

### Checkpoint verification

- `S3ZaUT`: iOS26.5, Ionic9.0.0, four native/Web driver cases passed
  (ButtonShort, Alert, ActionSheet, Navigation), light/dark. All16 current-build
  geometry/input envelopes validated. The readiness label is now visually hidden
  while still discoverable to XCTest. Reproducible source archive is265KB.
- Latest full browser matrix: **230/230 on Ionic9.0.0**, **230/230 on Ionic8.8.19**,
  each across Chromium and WebKit. An added explicit `size="default"` test caught
  a42pt single toolbar button after border removal; now both implicit/explicit
  default sizes are44pt. Opt-out siblings remain untouched.
- Afterwards, dimming keyframes were changed to retain CSS `calc()` / variable
  expressions rather than parseFloat them. The26 overlay cases passed again on
  both Ionic8 and Ionic9, including a computed `--backdrop-opacity: calc(0.1 + 0.2)` assertion.
- Library CSS/TypeScript builds passed on both Ionic versions. Package and
  lockfile diffs remain empty. Test matrix installations affect only this isolated
  worktree's node_modules, not the user's original checkout.
- Restored actual Ionic9.0.0 dependencies after the matrix. Final library build,
  demo production build and root formatting lint passed. Production build emits
  unused-import/browser-support warnings and a2.43MB initial-bundle warning
  against the2MB warning budget; these are not cleared by this checkpoint.
  Generated Playwright reports/results are excluded from formatting lint.
- Generated docs were refreshed from their source. The pre-existing stale
  relative using-ion-item-group link now reflects the source's documentation URL.
  No screenshot baselines, release metadata or original-checkout files changed.

Outstanding acceptance remains substantial: tab transfer/geometry/material;
navigation/title/back-button curves and velocity-sensitive cancellation;
toggle release undershoot; range velocity deformation; segment hold/drag;
searchable tabs; grouped/back/large/FAB button motion; scrolling glass/backgrounds;
sidebar/card/popover appearance; toast/modal; iPad/rotation; full Shell bridge and
physical iOS26. Existing image baselines have not been approved or overwritten.
Do not describe this checkpoint as matching main's overall completion level.

Toggle: the measured track/handle dimensions and missing short-tap continuation
justify testing the equivalent visual-state implementation from main, with iOS
26-scoped properties. Curve and material validation remain pending; no claim of
completed toggle parity yet.

- Working branch: `feat/ios26-native-parity`.
- Worktree: `/private/tmp/ionic-ios26-parity`.
- Xcode 26.6 (17F113), desktop Xcode 27.0 (27A266a).
- Installed runtimes: iOS 26.1, 26.5, 27.0.
- Existing iOS 27 probes are being recovered from temporary files; their old
  output is historical evidence and must not be reported as a current run.

## Subsequent checkpoint: iOS26 three-item tabs

This is a measured tab increment, **not completion of the overall parity task**.
The public registration signature and iOS26 brightness palette remain intact.
No iOS27 component structure, package rename, release metadata or native bridge
was introduced. Original checkout remains untouched.

### Independent reference and recording quality

- `KITsYi` (26.5) and `qDD5O2` (26.1): an independent three-item
  `UITabBarController` has a274×62pt platter and94×54pt selection cell,
  4pt inset and86pt center spacing (8pt cell overlap). The standalone UIKit
  fixture agrees. Web fixture coordinates now correspond to that independently
  measured platter, rather than the old320px Web width /360pt UIKit host.
- `testTabsMotion` separates a selected hold, four requested transfer durations,
  and80/600pt/s drags. Actual input timestamps, not requested XCTest durations,
  are authoritative. The driver now asserts actual selected items after each
  transfer; the validator requires7 down/up/click events in each Web record.
- `KITsYi`/`srB3U7` exposed recording overhead: repeatedly serializing the entire
  growing data set introduced100–300ms stalls. Tabs now retain the useful layer
  containers and flush once after the driver finishes, via a test-only Darwin
  notification with an acknowledgement. `qDD5O2` native transfers generally
  have18–21ms maximum gaps, rather than increasingly long pauses. Other controls'
  existing recorders were not changed by this increment.
- `report.py` adds raw input-aligned tab curves, separately removing platter
  scaling from lens dimensions/center. Plotted gaps over50ms remain gaps. JSON
  includes an explicitly bounded first650ms diagnostic comparison, interpolating
  native samples only across gaps<=40ms and flagging hold-duration differences.

### Production changes

- `src/tab-bar/` replaces the public tab wrapper's use of the old generic
  sheets-of-glass gesture. `tab-selected`, Ionic routing, and event emission stay
  with Ionic. The runtime only previews the lens and calls the Ionic click handler
  when touch/drag did not deliver a compatibility click.
- Short right/left transfers use independently recorded26.1 curves. Holding a
  transfer has a different rebound from tapping; selected holds are separate.
  All timestamps retain their measured pointerdown origin. Missing intermediate
  samples are not labelled as measurements; the late held settling endpoint and
  velocity-dependent drag behavior remain candidates.
- Native platter release fits an underdamped response:17.5rad/s, damping0.6,
  onset1/60s. Normalized RMS fit error is<.001 in the selected-hold recording.
  Short releases continue the press through that onset and carry velocity;
  a66ms release recording is no longer replayed for a150ms hold.
- Body-owned lenses use fixed coordinates, including conversion when Ionic's
  transformed body establishes the containing block. Backwards animation fill
  prevents zero-size samples when a drag replaces an animation before the next
  document-timeline tick. Scroll/resize/blur/cancel/reduced-motion/native-shell
  ownership changes cancel the preview. Callers must still destroy on page leave.
- WKWebView touch exposed a real failure absent from mouse-only tests: the
  compatibility click could be suppressed and the preview returned to the old
  selection. One post-pointerup Ionic click now owns touch commit, and touch
  identities suppress late native duplicates. A queued second pointerdown flushes
  the preceding released session before beginning its preview.
- CSS separates the physical-pixel glass rim from layout, uses62pt outer/54pt
  inner height,4pt padding, and measured three-item maximum width. Existing
  four/five-item width policies remain unqualified, not silently replaced with
  iOS27's layout tables. The right safe-area term no longer repeats the left.
- Dark resting surface samples in `CS7J5p`: native/Web background bothRGB19,
  selection bothRGB53, top rim47 versus48. Light material was refined further
  after that run; typography/rim/shadow and non-uniform backgrounds still require
  more complete contour/material acceptance than these selected pixel samples.

### Verification and remaining differences

- `CS7J5p` (26.5) and `A2vnzH` (26.1): tab-motion and pinned Shell-tab drivers
  pass in light/dark, with current-build envelopes and7 Web click events.
  `A2vnzH` contains the updated26.1 motion tables and velocity-carrying platter
  release. Earlier `srB3U7`/`qDD5O2` Web drivers lacked selection assertions;
  they are useful native references but are **not passing Web selection evidence**.
- In `A2vnzH`, matched-duration transfer/hold cases in the first650ms have mean
  unscaled lens width/height errors about0.1–0.2pt and center errors0.3–0.5pt.
  Center maxima still reach~2.8pt. These are sampled trajectory diagnostics,
  not whole-animation or pixel-equivalence claims. The first light short tap
  delivered83ms native versus60ms Web and must not be treated as equal input.
- Drag is still visibly behind the acceptance target: low-speed center error
  averages~3.4pt in this window; high-speed center maxima reach~25pt and vertical
  deformation~17pt. The implementation deliberately retains a conservative
  drag candidate; these figures are not hidden in aggregate tap statistics.
- Cursor Auto supplied bounded test suggestions and a correctness review.
  Suggestions were inspected before applying; an incorrect top-left comparison
  of an expanded lens was replaced by a center comparison. Queued-input and
  late-touch-click findings were addressed. Release outside an enabled tab still
  cancels rather than selecting a stale drag destination; gap behavior needs its
  own native qualification before changing that policy.
- Ionic9 full244-case suite passed before the final queued/touch additions;
  the subsequent34 tab cases passed across Chromium/WebKit. Final dependency
  matrix results are recorded below when complete. No existing image baselines
  were approved or overwritten.

Next acceptance targets: velocity-dependent drag and its release deformation;
two/four/five-item bars and custom-width/icon/badge layouts; RTL/iPad/rotation;
pressed glass material and moving backgrounds. Navigation/scrolling-glass and
the broader outstanding list from the previous checkpoint also remain open.

- `PqS7IS`: final rendering/curve snapshot on26.5, with the touch-identity and
  queued-input fixes plus refined light material; both native/Web motion and
  Shell drivers pass. All6 envelopes validate, including exactly7 Web clicks per
  appearance. After this snapshot only cancelled-touch identity expiry/cleanup
  was tightened in production code (covered by the browser matrix).
  Most native transfer/drag frame gaps are18–22ms; first Web holds still have
  one51–58ms startup gap, so the probe is not literally overhead-free.
- `PqS7IS` matched-duration normal transfers reproduce the26.1 improvements on
  26.5: early-window lens-dimension mean errors~0.1–0.23pt. High-speed drag still
  reaches~24.6pt center error and~16.7pt vertical deformation error. Source26.1
  fitting and26.5 validation are kept distinct; no time shift was fitted to
  make this comparison look better.
- Final actual Ionic8.8.19 matrix: **248/248 browser cases passed** across
  Chromium and WebKit; library CSS/TypeScript build and formatting lint passed.
  Root and demo both used8.8.19 (not an adapter relabelled over9). Package/lockfile
  diffs remain empty. Dependencies are restored to actual9.0.0 after the matrix.
- Final actual Ionic9.0.0 matrix: **248/248 passed** across Chromium/WebKit on
  the final source, including cancelled-touch expiry cleanup. Library build,
  formatting lint and demo production build pass. Demo initial bundle is2.44MB;
  existing unused-import, Stencil glob, browser-support and2MB warning-budget
  warnings remain. Generated docs introduced no extra diff.
- Final changes are local to `feat/ios26-native-parity`, not pushed. Both package
  manifests/lockfiles and the original `fix/footer-design` checkout are unchanged.
