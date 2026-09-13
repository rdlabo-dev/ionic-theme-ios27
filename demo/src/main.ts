import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { enableNativeUIShell } from '../../src/native';

bootstrapApplication(AppComponent, appConfig).catch((err) => console.error(err));
void enableNativeUIShell().then((handle) => Object.assign(window, { nativeUIShell: handle }));
