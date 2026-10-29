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

| Web setup                          | What to configure                                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iOS 27 theme                       | Load the matching [System, Class or Always dark-mode pair](https://docs.rdlabo.dev/projects/ionic-theme-ios27/docs/setup#choose-one-dark-mode-pair). The theme supplies the appearance marker. |
| Ionic with an existing theme       | Keep `--ion-background-color-rgb` consistent with the active palette; native appearance uses it when no theme marker is present.                                                               |
| HTML without those theme variables | Set `color-scheme: light` or `color-scheme: dark` to match the active Web theme.                                                                                                               |
| System-managed HTML appearance     | Use system-responsive CSS; when no single scheme is selected, native appearance falls back to the system setting.                                                                              |

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

Native light/dark appearance selects the system material and control appearance; it does not reproduce arbitrary application CSS. Vertical button fill and tint remain governed by the separate [button appearance settings](https://docs.rdlabo.dev/projects/capacitor-native-ui/docs/vertical-bars#choose-button-appearance).

## Temporary images beneath Web overlays

When a blocking Web overlay requires native controls to leave the foreground, the runtime can display a prepared image on each original Web component or its Vertical Bars clone. This is a visual handoff, not another interactive control. Ionic keeps ownership of the overlay lifecycle, backdrop, focus and dismissal.

The handoff follows these rules:

1. Prepare images after an accepted native update and coalesce subsequent visual changes. Do not capture during a touch. Keep the last completed image while a replacement is being prepared. Web clones receive the prepared state before insertion or layout, and stay hidden as an entire composited layer until handoff so their appearance cannot bleed into live native glass.
2. At presentation, reuse the prepared image without waiting for capture, encoding, decoding or a bridge response. Never delay the application's click or replay it to complete the handoff.
3. Put the image on the source surface below the Web backdrop. When an overlay animates its `presentingElement`, attach the prepared image-only layer inside that element so the images inherit the same transform, filter and clip as its background. Do not move the actual Ionic controls. Convert coordinates once before the animation; no per-frame position or color synchronization is needed. A shared native rail requires images for all of its retiring controls.
4. While a sheet moves, let its Web surface carry the image. Do not send a native position update for every animation frame.
5. On return, recreate native controls at the current position and remove the image after the corresponding native update is accepted. Only an update started after restoration was requested and accepting every captured control may acknowledge the return. Install Native ownership before removing the images, without a Web-to-Native crossfade. An older or partial response must not retire a newer handoff. Retire only the temporary return copy; keep a valid prepared image available for immediate reopening until its replacement is ready. Moving an entire transient surface preserves its image when source sizes and positions relative to that surface are unchanged; the handoff uses current destination coordinates. Changes within the surface or to its appearance invalidate the cache. A Modal image may only return to the Modal that supplied it.
6. Discard images after incompatible viewport, layout or appearance changes of their own sources. Changes to another surface do not invalidate a completed image. Missing images and bridge failures must release ownership to the existing Web presentation rather than block input or leave a stale image indefinitely.

Background controls and controls on a moving Modal use the same image lifecycle. They keep separate image ownership because they can be visible simultaneously on different coordinate surfaces. The Modal supplies its moved return coordinates; component adapters supply native bounds and the Web rendering target. Engine owns the common image handoff protocol, coordinate conversion and copy retirement. Native UI supplies eligible native bounds, decides which complete shared containers may be hidden, and applies normal native layout and update acknowledgements. Component adapters do not define separate capture, handoff or failure policies. JavaScript updates the ownership attributes; permanent runtime CSS controls concealment and image visibility. Per-image styles contain only geometry and image URLs, so releasing an image never releases Native ownership of a Web clone.

| Situation                                                                            | Route                                                          |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Native popover retaining its native source controls                                  | Keep the native controls; do not freeze them.                  |
| Blocking Web Modal (including card), popover, alert, action sheet, loading or picker | Use prepared background images when available.                 |
| Sheet leaving the background interactive, or an overlay without a backdrop           | Keep the existing live presentation.                           |
| Menu transforming content                                                            | Keep the existing route; do not apply fixed background images. |
| Toast                                                                                | Keep the existing live route.                                  |

Image availability is not permission to change the control's disabled state, dispatch an action, bypass focus trapping or prolong an overlay. App-local extensions use the same pre-overlay image rule; their image freezes the last prepared content while the overlay prevents interaction. Capture fidelity must be checked against the displayed native material, including blur, before a component is enabled for image handoff.
