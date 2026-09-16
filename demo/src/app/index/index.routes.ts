import { Routes } from '@angular/router';
import { IndexPageComponent } from './index-page.component';

export const routes: Routes = [
  {
    path: '',
    component: IndexPageComponent,
  },
  {
    path: 'action-sheet',
    loadComponent: () => import('./pages/action-sheet/action-sheet.page').then((m) => m.ActionSheetPage),
  },
  {
    path: 'alert',
    loadComponent: () => import('./pages/alert/alert.page').then((m) => m.AlertPage),
  },
  {
    path: 'button',
    loadComponent: () => import('./pages/button/button.page').then((m) => m.ButtonPage),
  },
  {
    path: 'checkbox',
    loadComponent: () => import('./pages/checkbox/checkbox.page').then((m) => m.CheckboxPage),
  },
  {
    path: 'range',
    loadComponent: () => import('./pages/range/range.page').then((m) => m.RangePage),
  },
  {
    path: 'toast',
    loadComponent: () => import('./pages/toast/toast.page').then((m) => m.ToastPage),
  },
  {
    path: 'toggle',
    loadComponent: () => import('./pages/toggle/toggle.page').then((m) => m.TogglePage),
  },
  {
    path: 'segment',
    loadComponent: () => import('./pages/segment/segment.page').then((m) => m.SegmentPage),
  },
  {
    path: 'modal',
    loadComponent: () => import('./pages/modal/modal.page').then((m) => m.ModalPage),
  },
  {
    path: 'native-ui-shell',
    loadComponent: () => import('./pages/native-ui-shell/native-ui-shell.page').then((m) => m.NativeUIShellPage),
  },
  {
    path: 'card',
    loadComponent: () => import('./pages/card/card.page').then((m) => m.CardPage),
  },
  {
    path: 'chip',
    loadComponent: () => import('./pages/chip/chip.page').then((m) => m.ChipPage),
  },
  {
    path: 'breadcrumbs',
    loadComponent: () => import('./pages/breadcrumbs/breadcrumbs.page').then((m) => m.BreadcrumbsPage),
  },
  {
    path: 'searchbar',
    loadComponent: () => import('./pages/searchbar/searchbar.page').then((m) => m.SearchbarPage),
  },
  {
    path: 'popover',
    loadComponent: () => import('./pages/popover/popover.page').then((m) => m.PopoverPage),
  },
  {
    path: 'progress-indicators',
    loadComponent: () => import('./pages/progress-indicators/progress-indicators.page').then((m) => m.ProgressIndicatorsPage),
  },
  {
    path: 'floating-action-button',
    loadComponent: () => import('./pages/floating-action-button/floating-action-button.page').then((m) => m.FloatingActionButtonPage),
  },
  {
    path: 'floating-action-button-fixed',
    loadComponent: () =>
      import('./pages/floating-action-button-fixed/floating-action-button-fixed.page').then((m) => m.FloatingActionButtonFixedPage),
  },
  {
    path: 'select',
    loadComponent: () => import('./pages/select/select.page').then((m) => m.SelectPage),
  },
  {
    path: 'radio',
    loadComponent: () => import('./pages/radio/radio.page').then((m) => m.RadioPage),
  },
  {
    path: 'date-and-time-pickers',
    loadComponent: () => import('./pages/date-and-time-pickers/date-and-time-pickers.page').then((m) => m.DateAndTimePickersPage),
  },
  {
    path: 'accordion',
    loadComponent: () => import('./pages/accordion/accordion.page').then((m) => m.AccordionPage),
  },
  {
    path: 'inputs',
    loadComponent: () => import('./pages/inputs/inputs.page').then((m) => m.InputsPage),
  },
  {
    path: 'item-list',
    loadComponent: () => import('./pages/item-list/item-list.page').then((m) => m.ItemListPage),
  },
  {
    path: 'reorder',
    loadComponent: () => import('./pages/reorder/reorder.page').then((m) => m.ReorderPage),
  },
  {
    path: 'tabs',
    loadComponent: () => import('./pages/tabs/tabs.page').then((m) => m.TabsPage),
  },
  {
    path: 'toolbar',
    loadComponent: () => import('./pages/toolbar/toolbar.page').then((m) => m.ToolbarPage),
  },
];
