import { AfterViewInit, Component, DestroyRef, ElementRef, inject, OnDestroy, OnInit, viewChild } from '@angular/core';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonIcon,
  IonItem,
  IonItemGroup,
  IonLabel,
  IonList,
  IonMenu,
  IonProgressBar,
  IonSplitPane,
  IonTabBar,
  IonTabButton,
  IonTabs,
  IonThumbnail,
  IonToolbar,
  ViewDidEnter,
  ViewDidLeave,
} from '@demo/ionic';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { enableTabAccessory, registeredEffect, registerTabBarEffect } from '../../../../src';
import { applyFoldStateClasses } from '../../../../src/vertical-bars';
import { Foldable, type FoldState } from '@erkamyaman/capacitor-foldable';
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
    IonToolbar,
    IonThumbnail,
    IonButton,
    IonButtons,
    IonProgressBar,
    RouterLink,
  ],
})
export class TabsPage implements OnInit, AfterViewInit, OnDestroy, ViewDidEnter, ViewDidLeave {
  readonly #router = inject(Router);
  readonly #el = inject(ElementRef);
  readonly splitPane = viewChild.required<IonSplitPane, ElementRef<HTMLIonSplitPaneElement>>('splitPane', { read: ElementRef });
  #hingeListener?: { remove(): Promise<void> };
  readonly #destroyRef = inject(DestroyRef);
  readonly registeredGestures: registeredEffect[] = [];
  playing = true;
  showAccessory = false;
  classicAccessory = false;
  accessoryActivated = false;
  ngOnInit() {
    this.#router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(this.#destroyRef),
      )
      .subscribe((params) => {
        const tabBar = this.#el.nativeElement.querySelector('ion-tab-bar');
        if (!tabBar) {
          return;
        }
        const path = params.urlAfterRedirects.split(/[?#]/, 1)[0];
        const hideTabs = ['/main/settings', '/main/index/toolbar', '/main/index/button-projection'].includes(path);
        if (hideTabs) {
          tabBar.classList.add('tab-bar-hidden');
        } else {
          tabBar.classList.remove('tab-bar-hidden');
        }
        this.showAccessory = !hideTabs && (path === '/main/album' || /[?&]miniPlayer(?:=|$|&)/.test(params.urlAfterRedirects));
        this.classicAccessory =
          /[?&]classic(?:=|$|&)/.test(params.urlAfterRedirects) ||
          !(typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('text-wrap', 'pretty'));
      });
  }

  ngAfterViewInit() {
    void this.observeHinge().catch((error) => console.error(error));
  }

  setFoldState(fold: FoldState) {
    const root = this.#el.nativeElement.closest('ion-app') as HTMLElement;
    applyFoldStateClasses(root, fold);
    // Visibility remains an application choice; the helper controls state classes.
    this.splitPane().nativeElement.setAttribute(
      'when',
      root.classList.contains('ios-theme-fold-expanded') ? '(min-width: 900px)' : '(min-width: 992px)',
    );
  }

  async observeHinge() {
    if (Capacitor.getPlatform() !== 'ios') return;
    this.#hingeListener = await Foldable.addListener('foldStateChange', (fold) => {
      if (!this.#destroyRef.destroyed) this.setFoldState(fold);
    });
    if (this.#destroyRef.destroyed) return this.#releaseHinge();
    const fold = await Foldable.getFoldState();
    if (!this.#destroyRef.destroyed) this.setFoldState(fold);
  }

  #releaseHinge() {
    void this.#hingeListener?.remove();
    this.#hingeListener = undefined;
  }

  ngOnDestroy() {
    this.#releaseHinge();
    this.ionViewDidLeave();
  }

  togglePlay(event: Event) {
    event.stopPropagation();
    this.playing = !this.playing;
  }

  onAccessoryActivate() {
    this.accessoryActivated = true;
  }

  ionViewDidEnter() {
    const registerGesture = registerTabBarEffect(document.querySelector<HTMLElement>('ion-tab-bar')!);
    if (registerGesture) {
      this.registeredGestures.push(registerGesture);
    }
    this.registeredGestures.push(enableTabAccessory());
  }

  ionViewDidLeave() {
    this.registeredGestures.splice(0).forEach((gesture) => gesture.destroy());
  }
}
