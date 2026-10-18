import { AfterViewInit, Component, DestroyRef, ElementRef, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { registeredEffect, registerTabBarEffect } from '@rdlabo/ionic-theme-ios27';
import { applyFoldStateClasses } from '@rdlabo/ionic-theme-ios27';
import { Foldable, type FoldState } from '@erkamyaman/capacitor-foldable';
import { MiniPlayerComponent } from '../mini-player/mini-player.component';
import { Capacitor } from '@capacitor/core';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [
    MiniPlayerComponent,
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
  readonly #destroyRef = inject(DestroyRef);
  readonly registeredGestures: registeredEffect[] = [];
  readonly showMiniPlayer = signal(false);
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
        this.showMiniPlayer.set(path === '/main/index/native-ui-extension');
        if (['/main/settings', '/main/index/toolbar', '/main/index/button-projection'].includes(path)) {
          tabBar.classList.add('tab-bar-hidden');
        } else {
          tabBar.classList.remove('tab-bar-hidden');
        }
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

  ionViewDidEnter() {
    const registerGesture = registerTabBarEffect(document.querySelector<HTMLElement>('ion-tab-bar')!);
    if (registerGesture) {
      this.registeredGestures.push(registerGesture);
    }
  }

  ionViewDidLeave() {
    this.registeredGestures.splice(0).forEach((gesture) => gesture.destroy());
  }
}
