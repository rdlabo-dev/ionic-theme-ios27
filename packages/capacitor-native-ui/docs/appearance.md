# Light and dark appearance

Native UI reads the computed style of each projected source element and sends its light/dark appearance to the native renderer. Configure appearance in your Web CSS; there is no separate native dark-mode startup option.

## How appearance is resolved

The first applicable row wins:

| Priority | Computed source style                                    | Result                                                                                                                        |
| -------- | -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 1        | Theme-provided `--ios27-color-scheme` is non-empty       | `dark` selects dark; other values select light. The iOS 27 theme supplies this marker through its light and dark stylesheets. |
| 2        | `--ion-background-color-rgb` supplies three RGB channels | Infers dark or light from the background brightness.                                                                          |
| 3        | CSS `color-scheme` contains only `dark` or only `light`  | Uses that scheme. `light dark` does not select a single appearance.                                                           |
| 4        | None of the above                                        | Uses the system's `prefers-color-scheme: dark` setting.                                                                       |

Theme markers and Ionic background values take precedence over `color-scheme`. Changing only an arbitrary CSS background or text color does not select native light/dark appearance.

## Match your Web theme

| Web setup                          | What to configure                                                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS 27 theme                       | Load the matching [System, Class or Always dark-mode pair](../../theme-ios27/docs/setup.md#choose-one-dark-mode-pair). The theme supplies the appearance marker. |
| Ionic with an existing theme       | Keep `--ion-background-color-rgb` consistent with the active palette; native appearance uses it when no theme marker is present.                                 |
| HTML without those theme variables | Set `color-scheme: light` or `color-scheme: dark` to match the active Web theme.                                                                                 |
| System-managed HTML appearance     | Use system-responsive CSS; when no single scheme is selected, native appearance falls back to the system setting.                                                |

For example, a plain HTML app with a manual dark-mode class can declare:

```css
:root {
  color-scheme: light;
}

:root.app-dark {
  color-scheme: dark;
}
```

Use the same class for your application's dark palette. This example assumes neither of the higher-priority theme variables is supplied. Class/style mutations and system appearance changes trigger re-evaluation while the runtime is active. For style changes without an observed DOM mutation, call `shell.markForCheck()` after applying them.

## Shared Vertical Bars appearance

Ordinary controls resolve appearance from their own source styles. Vertical Bars shares one native rail appearance: **if any projected control is dark, the whole rail uses dark appearance**. It does not render separate light and dark rail regions. Keep sources projected into the same rail on a consistent Web palette.

Native light/dark appearance selects the system material and control appearance; it does not reproduce arbitrary application CSS. Vertical button fill and tint remain governed by the separate [button appearance settings](vertical-bars.md#choose-button-appearance).
