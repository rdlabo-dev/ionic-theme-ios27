import { AfterViewInit, Component, ElementRef, inject, OnDestroy, OnInit, viewChild } from '@angular/core';
import {
  IonContent,
  IonIcon,
  IonItem,
  IonItemGroup,
  IonLabel,
  IonList,
  IonMenu,
  IonSplitPane,
  IonTabBar,
  IonTabButton,
  IonTabs,
  ViewDidEnter,
  ViewDidLeave,
} from '@demo/ionic';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';

// import { registerTabBarEffect } from '@rdlabo/ionic-theme-ios27';
import { registeredEffect, registerTabBarEffect } from '../../../../src';
import { HingeStatus, IonicNativeUIShell } from '@rdlabo/ionic-theme-ios27/vertical-bars';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [
    IonTabs,
    IonTabBar,
    IonTabButton,
    IonIcon,
    IonLabel,
    IonSplitPane,
    IonMenu,
    IonContent,
    IonList,
    IonItem,
    IonItemGroup,
    RouterLink,
  ],
})
export class TabsPage implements OnInit, AfterViewInit, OnDestroy, ViewDidEnter, ViewDidLeave {
  readonly #router = inject(Router);
  readonly #el = inject(ElementRef);
  readonly splitPane = viewChild.required<IonSplitPane, ElementRef<HTMLIonSplitPaneElement>>('splitPane', { read: ElementRef });
  #hingeListener?: { remove(): Promise<void> };
  #hingeMonitoring = false;
  #destroyed = false;
  readonly registeredGestures: registeredEffect[] = [];
  ngOnInit() {
    this.#router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((params) => {
      const tabBar = this.#el.nativeElement.querySelector('ion-tab-bar');
      if (!tabBar) {
        return;
      }
      if (['/main/settings', '/main/index/toolbar'].includes(params.urlAfterRedirects)) {
        tabBar.classList.add('tab-bar-hidden');
      } else if (tabBar) {
        tabBar.classList.remove('tab-bar-hidden');
      }
    });
  }

  ngAfterViewInit() {
    void this.observeHinge();
  }

  setHingeStatus(status: HingeStatus) {
    const splitPane = this.splitPane().nativeElement;
    // The width rules key off the `when` attribute, so go through setAttribute.
    splitPane.setAttribute('when', status === HingeStatus.Unavailable ? '(min-width: 992px)' : '(min-width: 900px)');
    splitPane.classList.toggle('ios-theme-split-pane-half-open', status === HingeStatus.PartiallyOpen);
  }

  async observeHinge() {
    if (Capacitor.getPlatform() !== 'ios') return;
    await IonicNativeUIShell.startDeviceLayoutMonitoring();
    this.#hingeMonitoring = true;
    if (this.#destroyed) return this.#releaseHinge();
    this.#hingeListener = await IonicNativeUIShell.addListener('deviceLayoutChange', ({ hingeStatus }) => {
      if (!this.#destroyed) this.setHingeStatus(hingeStatus);
    });
    const { hingeStatus } = await IonicNativeUIShell.getDeviceLayout();
    if (this.#destroyed) return this.#releaseHinge();
    this.setHingeStatus(hingeStatus);
  }

  #releaseHinge() {
    void this.#hingeListener?.remove();
    this.#hingeListener = undefined;
    if (this.#hingeMonitoring) {
      this.#hingeMonitoring = false;
      void IonicNativeUIShell.stopDeviceLayoutMonitoring();
    }
  }

  ngOnDestroy() {
    this.#destroyed = true;
    this.#releaseHinge();
  }

  ionViewDidEnter() {
    const registerGesture = registerTabBarEffect(document.querySelector<HTMLElement>('ion-tab-bar')!);
    if (registerGesture) {
      this.registeredGestures.push(registerGesture);
    }
  }

  ionViewDidLeave() {
    this.registeredGestures.forEach((gesture) => gesture.destroy());
  }
}
