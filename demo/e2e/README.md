# Theme regression tests

Use the existing Playwright command: `npm --prefix demo run test:e2e`.
The existing CI matrix runs against actual Ionic 8 and 9 packages.

`screenshot.spec.ts` owns static light/dark appearance. The additional tests
protect behavior introduced or overridden by this theme, not Ionic itself:

| Spec | Regression worth maintaining |
| --- | --- |
| `ios26-submit-brightness` | Public brightness colors, legacy alias, submit markup and disabled styling |
| `ios26-child-optout` | Nested selectors leaking theme styles into opted-out children |
| `ios26-popover-position` | Theme positioning losing event coordinates, clipping content or retaining temporary widths |
| `ios26-segment-parity` | Selection effects duplicating events/lenses or ignoring reduced motion/custom styles |
| `ios26-tab-lifecycle` | 1–5 tab layout (five without FAB), phone/tablet boundaries, click ownership and cleanup |
| `ios26-range-parity` | Enlarged thumbs moving past LTR/RTL endpoints or deforming the inactive dual thumb |
| `toggle` | Short-tap effects not settling, or CSS overriding reduced motion/public styling |

Do not duplicate screenshot coverage with lists of CSS constants or re-test
Ionic's unmodified behavior. Prefer relations (containment, unchanged value,
single event, restored style) over implementation-specific animation samples.
Keep numeric layout cases only where a distinct boundary would otherwise be lost.

One-off native probes, copied Shell sources, raw frame/width dumps and their
runner/reporting stack were removed. Their last snapshot is commit `23b3554`
(`demo/native-parity`); it is historical evidence, not another maintained suite.
The small tab boundary table comes from its independent UIKit 26.5 measurements.
Passing browser regressions does not establish native pixel or motion parity.
