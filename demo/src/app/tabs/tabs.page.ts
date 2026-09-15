import { Component, ElementRef, inject, OnInit } from '@angular/core';
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
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

// import { registerTabBarEffect } from '@rdlabo/ionic-theme-ios26';
import { registeredEffect, registerTabBarEffect } from '../../../../src';

@Component({
  selector: 'app-tabs',
  templateUrl: 'tabs.page.html',
  styleUrls: ['tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel, IonSplitPane, IonMenu, IonContent, IonList, IonItem, IonItemGroup],
})
export class TabsPage implements OnInit, ViewDidEnter, ViewDidLeave {
  readonly #router = inject(Router);
  readonly #el = inject(ElementRef);
  readonly registeredGestures: registeredEffect[] = [];
  ngOnInit() {
    this.#router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((params) => {
      const tabBar = this.#el.nativeElement.querySelector('ion-tab-bar');
      if (!tabBar) {
        return;
      }
      if (['/main/settings'].includes(params.urlAfterRedirects)) {
        tabBar.classList.add('tab-bar-hidden');
      } else if (tabBar) {
        tabBar.classList.remove('tab-bar-hidden');
      }
    });
  }

  registerEffects(targets: Iterable<HTMLElement>) {
    for (const target of targets) {
      const registerGesture = registerTabBarEffect(target);
      if (registerGesture) {
        this.registeredGestures.push(registerGesture);
      }
    }
  }

  ionViewDidEnter() {
    this.registerEffects(this.#el.nativeElement.querySelectorAll('ion-tab-bar'));
  }

  ionViewDidLeave() {
    this.registeredGestures.splice(0).forEach((gesture) => gesture.destroy());
  }
}
