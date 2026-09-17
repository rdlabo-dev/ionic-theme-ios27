import { ApplicationConfig, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import * as allIcons from 'ionicons/icons';

import { routes } from './app.routes';
import { IONIC_MAJOR, provideIonicAngular } from '@demo/ionic';
import { addIcons } from 'ionicons';

addIcons(allIcons);

if (typeof document !== 'undefined') {
  document.documentElement.classList.add(`ionic-v${IONIC_MAJOR}`);
}

export interface IonicAnimationOptions {
  navAnimation?: (...args: any[]) => any;
  popoverEnter?: (...args: any[]) => any;
  popoverLeave?: (...args: any[]) => any;
}

// Disable animations during E2E tests for consistent screenshots
const isE2ETesting = typeof window !== 'undefined' && (window as any).IONIC_E2E_TESTING === true;

export const createAppConfig = (animations: IonicAnimationOptions = {}): ApplicationConfig => ({
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideIonicAngular({
      useSetInputAPI: true,
      mode: 'ios',
      backButtonText: '',
      animated: !isE2ETesting,
      ...animations,
    }),
  ],
});
