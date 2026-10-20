import { enableNativeUI, type NativeUIHandle } from '@rdlabo/capacitor-native-ui/core';

const root = document.querySelector<HTMLElement>('#app')!;
const host = document.querySelector<HTMLElement>('#rail')!;
const mode = document.querySelector<HTMLInputElement>('#rail-mode')!;
let count = 0;
let handle: NativeUIHandle | undefined;
let lifecycle = Promise.resolve();
const showDetails = (details: boolean) => {
  document.querySelector<HTMLElement>('#home')!.hidden = details;
  document.querySelector<HTMLElement>('#details')!.hidden = !details;
};
document.querySelector('#open')!.addEventListener('click', () => showDetails(true));
document.querySelector('#back')!.addEventListener('click', () => showDetails(false));
document.querySelector('#add')!.addEventListener('click', () => {
  document.querySelector('#count')!.textContent = `Count: ${++count}`;
});
const start = async () => {
  await handle?.destroy();
  document.body.classList.toggle('rail-layout', mode.checked);
  root.querySelectorAll<HTMLElement>('[data-native-ui]').forEach((element) => {
    if (mode.checked) element.setAttribute('data-native-ui-placement', 'rail');
    else element.removeAttribute('data-native-ui-placement');
  });
  handle = await enableNativeUI({
    root,
    verticalBars: { placement: { edge: 'trailing', webHost: host } },
  });
  document.querySelector('#status')!.textContent = 'Ready';
};
mode.addEventListener('change', () => {
  lifecycle = lifecycle.then(start);
});
document.querySelector('#stop')!.addEventListener('click', () => {
  lifecycle = lifecycle.then(async () => {
    await handle?.destroy();
    document.querySelector('#status')!.textContent = 'Stopped';
  });
});
lifecycle = lifecycle.then(start);
