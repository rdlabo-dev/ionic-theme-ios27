import { ChangeDetectionStrategy, Component, computed, DOCUMENT, inject, signal } from '@angular/core';

import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemGroup,
  IonLabel,
  IonList,
  IonListHeader,
  IonMenuButton,
  IonTitle,
  IonToggle,
  IonToolbar,
  ToggleCustomEvent,
} from '@demo/ionic';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { setVerticalBarsLayout } from '@rdlabo/ionic-theme-ios27';
import { Foldable } from '@erkamyaman/capacitor-foldable';

interface IComponent {
  name: string;
  enable: boolean;
}

@Component({
  selector: 'index-page',
  templateUrl: './index-page.component.html',
  styleUrls: ['./index-page.component.scss'],
  imports: [
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    FormsModule,
    IonButton,
    IonButtons,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonItemGroup,
    IonToggle,
    IonMenuButton,
    RouterLink,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndexPageComponent {
  readonly components = signal<IComponent[]>([
    { name: 'accordion', enable: true },
    { name: 'action-sheet', enable: true },
    { name: 'alert', enable: true },
    { name: 'breadcrumbs', enable: true },
    { name: 'button', enable: true },
    { name: 'card', enable: true },
    { name: 'checkbox', enable: true },
    { name: 'chip', enable: true },
    { name: 'date-and-time-pickers', enable: true },
    { name: 'floating-action-button', enable: true },
    { name: 'floating-action-button-fixed', enable: true },
    { name: 'inputs', enable: true },
    { name: 'item-list', enable: true },
    { name: 'modal', enable: true },
    { name: 'popover', enable: true },
    { name: 'progress-indicators', enable: true },
    { name: 'radio', enable: true },
    { name: 'range', enable: true },
    { name: 'reorder', enable: true },
    { name: 'searchbar', enable: true },
    { name: 'segment', enable: true },
    { name: 'select', enable: true },
    { name: 'tabs', enable: true },
    { name: 'toast', enable: true },
    { name: 'toggle', enable: true },
    { name: 'toolbar', enable: true },
  ]);
  readonly enableComponents = computed(() => this.components().filter((c) => c.enable));
  readonly disableComponents = computed(() => this.components().filter((c) => !c.enable));

  readonly #router = inject(Router);
  readonly #route = inject(ActivatedRoute);
  readonly #document = inject(DOCUMENT);

  get verticalBarsModeEnabled() {
    return !!this.#document.querySelector('ion-app.ios-theme-vertical-bars');
  }

  async navigateNativeUI() {
    await this.#router.navigate(['native-ui'], { relativeTo: this.#route });
  }

  async navigateComponent(item: IComponent) {
    await this.#router.navigate([item.name], { relativeTo: this.#route });
  }

  changeColorMode(event: ToggleCustomEvent) {
    this.#document.documentElement.classList.toggle('ion-palette-dark', event.detail.checked);
  }

  async changeVerticalBarsMode(event: ToggleCustomEvent) {
    if (!event.detail.checked) return setVerticalBarsLayout({ edge: null });
    const { verticalBarEdge, inset } = await Foldable.getBarPlacement();
    setVerticalBarsLayout({ edge: verticalBarEdge ?? 'trailing', inset });
  }
}
