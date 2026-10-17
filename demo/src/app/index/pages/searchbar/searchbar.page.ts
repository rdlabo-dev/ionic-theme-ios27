import { AfterViewInit, Component, ElementRef, OnDestroy, QueryList, ViewChildren } from '@angular/core';
import { closeOutline } from 'ionicons/icons';
import { supportSeachbarCancelButtonIcon, SearchbarCancelButtonIconSupport } from '@rdlabo/ionic-theme-ios27';

import { FormsModule } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemGroup,
  IonLabel,
  IonList,
  IonSearchbar,
  IonText,
  IonTitle,
  IonToolbar,
} from '@demo/ionic';

@Component({
  selector: 'app-searchbar',
  templateUrl: './searchbar.page.html',
  styleUrls: ['./searchbar.page.scss'],
  standalone: true,
  imports: [
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    FormsModule,
    IonBackButton,
    IonIcon,
    IonItem,
    IonItemGroup,
    IonLabel,
    IonList,
    IonText,
    IonSearchbar,
    IonButtons,
    IonButton,
  ],
})
export class SearchbarPage implements AfterViewInit, OnDestroy {
  @ViewChildren('nativeSearchbar', { read: ElementRef }) searchbars!: QueryList<ElementRef<HTMLIonSearchbarElement>>;
  readonly cancelIcon = closeOutline;
  #effects: SearchbarCancelButtonIconSupport[] = [];

  ngAfterViewInit() {
    this.#effects = this.searchbars.map(({ nativeElement }) => supportSeachbarCancelButtonIcon(nativeElement));
  }

  ngOnDestroy() {
    this.#effects.forEach((effect) => effect.destroy());
  }
}
