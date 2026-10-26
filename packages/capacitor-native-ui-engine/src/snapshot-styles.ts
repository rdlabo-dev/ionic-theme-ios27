/** Image presentation only; Native/Web ownership styling stays with the renderer. */
export const snapshotStyles = `
:is([data-native-ui-snapshot-source], [data-native-ui-snapshot-prepared]),
:is([data-native-ui-snapshot-source], [data-native-ui-snapshot-prepared]) *,
:is([data-native-ui-snapshot-source], [data-native-ui-snapshot-prepared])::after,
:is([data-native-ui-snapshot-source], [data-native-ui-snapshot-prepared])::part(native) { visibility: hidden !important; }
[data-native-ui-snapshot][data-native-ui-snapshot]::before {
 all:initial!important;content:""!important;display:block!important;position:absolute!important;
 visibility:visible!important;opacity:0!important;will-change:opacity!important;
 pointer-events:none!important;image-rendering:pixelated!important;
}
[data-native-ui-snapshot-visible] { opacity:1!important;overflow:visible!important; }
[data-native-ui-snapshot-visible][data-native-ui-snapshot][data-native-ui-snapshot]::before { opacity:1!important; }
`;
