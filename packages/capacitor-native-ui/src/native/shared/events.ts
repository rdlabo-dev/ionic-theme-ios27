export const CSS_MOTION_EVENTS = {
  transitionRun: 'transitionrun',
  transitionEnd: 'transitionend',
  transitionCancel: 'transitioncancel',
  animationStart: 'animationstart',
  animationEnd: 'animationend',
  animationCancel: 'animationcancel',
} as const;

// Ionic adapter event names. Generic DOM sources do not require this lifecycle.
export const LIFECYCLE_WILL_ENTER = 'ionViewWillEnter';
export const LIFECYCLE_WILL_LEAVE = 'ionViewWillLeave';
export const LIFECYCLE_DID_ENTER = 'ionViewDidEnter';
export const LIFECYCLE_DID_LEAVE = 'ionViewDidLeave';
