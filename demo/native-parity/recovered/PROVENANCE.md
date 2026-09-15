# Recovered measurement probes — provenance

These files are recovered copies of temporary measurement / probe code used during earlier
native-parity investigations. They are **not** evidence that iOS 26 matches iOS 27 behavior.

## Original paths

| Recovered path | Source |
| --- | --- |
| `button-native/` (`App.swift`, `Tests.swift`, `project.yml`) | `/private/tmp/ios27-button-curve` |
| `button-web/` (`App.swift`, `Tests.swift`, `project.yml`, `entry.js`, `www/index.html`) | `/private/tmp/ios27-button-simulator` |
| `range-native/` (`App.swift`, `Tests.swift`, `project.yml`) | `/private/tmp/ios27-range-probe` |

## Intentional edits during recovery

- `button-web/entry.js`: absolute `/Users/sakakibara/dev/ionic-theme-ios26/demo/node_modules/` import prefixes replaced with bare `@ionic/...` package imports.
- `button-web/www/index.html`: visible label `iOS 27` → `iOS 26`.
- `range-native/project.yml`: deployment target `iOS: '27.0'` → `iOS: '26.0'` only. Native control values in `App.swift` / `Tests.swift` were left unchanged.

Do not treat this tree as a claim of cross-version visual or behavioral parity.
