import { getNativeSearchBindings, requestNativeSearch } from '../native-integration';
import type { NativeSearchBinding } from '../native-integration';
import { excluded, iconSource, inFixedToolbar, marker, text, visible } from './dom';
import type { Candidate } from './dom';
import type { ShellItem, ShellSearch, ShellSearchEvent } from './definitions';

interface SearchState {
  binding: NativeSearchBinding;
  bar: HTMLIonSearchbarElement;
  input: HTMLInputElement;
  editSequence: number;
  composing: boolean;
  focused: boolean;
  minimumRevision: number;
  valueVersion: number;
  applyingInput: boolean;
  last?: ShellSearch;
  layout?: string;
  rejectedLayout?: string;
  restore: () => void;
}

export const createSearchSupport = (doc: Document, id: (element: Element) => string, schedule: () => void) => {
  const states = new Map<NativeSearchBinding, SearchState>();
  const projected = (binding: NativeSearchBinding) => binding.footer.hasAttribute(marker);
  const install = (binding: NativeSearchBinding, bar: HTMLIonSearchbarElement, input: HTMLInputElement): SearchState => {
    const originalFocus = bar.setFocus;
    const ownValue = Object.getOwnPropertyDescriptor(bar, 'value');
    let owner: object | null = bar;
    let value = ownValue;
    while (!value && (owner = Object.getPrototypeOf(owner))) value = Object.getOwnPropertyDescriptor(owner, 'value');
    const focus = async () => {
      if (projected(binding) && (await requestNativeSearch(binding, true, true))) return;
      await originalFocus.call(bar);
    };
    bar.setFocus = focus;
    let wrapped: PropertyDescriptor | undefined;
    if (value?.get && value.set && ownValue?.configurable !== false) {
      const descriptor = value;
      wrapped = {
        configurable: true,
        enumerable: value.enumerable,
        get: () => descriptor.get!.call(bar),
        set: (next: string | null | undefined) => {
          if (state.applyingInput) state.applyingInput = false;
          else state.valueVersion++;
          descriptor.set!.call(bar, next);
          schedule();
        },
      };
      Object.defineProperty(bar, 'value', wrapped);
    }
    const state: SearchState = {
      binding,
      bar,
      input,
      editSequence: 0,
      composing: false,
      focused: false,
      minimumRevision: 0,
      valueVersion: 0,
      applyingInput: false,
      restore: () => {
        if (bar.setFocus === focus) bar.setFocus = originalFocus;
        if (wrapped && Object.getOwnPropertyDescriptor(bar, 'value')?.set === wrapped.set) {
          if (ownValue) Object.defineProperty(bar, 'value', ownValue);
          else Reflect.deleteProperty(bar, 'value');
        }
        binding.active = binding.focused = false;
      },
    };
    states.set(binding, state);
    return state;
  };
  const readIcon = (element: HTMLElement, owner: Element, candidate: Candidate): ShellItem | undefined => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const item: ShellItem = {
      id: id(owner),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      label: text(element),
      accessibilityLabel: owner.getAttribute('aria-label') ?? text(element),
      disabled: false,
      selected: false,
      fontSize: parseFloat(style.fontSize),
      fontWeight: parseInt(style.fontWeight, 10) || 400,
      color: style.color,
    };
    const icon = element.matches('ion-icon') ? element : element.querySelector('ion-icon');
    const svg = icon?.shadowRoot?.querySelector<SVGElement>('svg') ?? element.querySelector<SVGElement>('svg');
    if (svg) {
      const source = iconSource(svg);
      if (!source) return;
      const iconStyle = getComputedStyle(icon ?? svg);
      item.iconWidth = parseFloat(iconStyle.width);
      item.iconHeight = parseFloat(iconStyle.height);
      // ion-searchbar gives its icon a full-height box; SVG meet sizing keeps the glyph square.
      const box = (svg as SVGSVGElement).viewBox?.baseVal;
      if (box?.width && box.height && svg.getAttribute('preserveAspectRatio') !== 'none') {
        const scale = Math.min(item.iconWidth! / box.width, item.iconHeight / box.height);
        item.iconWidth = box.width * scale;
        item.iconHeight = box.height * scale;
      }
      candidate.icons.push({ item, source });
    } else if (!item.label) return;
    return item;
  };
  return {
    decorate(candidates: Candidate[], blocked: (element: HTMLElement) => boolean): Candidate[] {
      const bindings = getNativeSearchBindings(doc);
      for (const [binding, state] of states) {
        if (!bindings.includes(binding) || !binding.footer.isConnected) {
          state.restore();
          states.delete(binding);
        }
      }
      const inactive: [Candidate, ShellSearch][] = [];
      for (const binding of bindings) {
        const candidate = candidates.find((c) => c.element === binding.tabBar);
        if (!candidate || candidate.control.search || binding.tabBar.getAttribute('slot') !== 'bottom') continue;
        const fab = binding.trigger.parentElement;
        // Search also supports the existing page-level fixed FAB, outside scrolling content.
        if (
          !fab?.matches('ion-fab[slot="fixed"]') ||
          !(fab.parentElement?.matches('ion-content') || (fab.parentElement?.matches('.ion-page') && !fab.closest('ion-content')))
        )
          continue;
        if (blocked(binding.footer) || !visible(binding.trigger) || binding.footer.closest(excluded)) {
          const state = states.get(binding);
          if (state?.last) inactive.push([candidate, { ...state.last, active: false, available: false, focused: false }]);
          continue;
        }
        const bar = binding.footer.querySelector<HTMLIonSearchbarElement>('ion-searchbar');
        const input = bar?.querySelector<HTMLInputElement>('input.searchbar-input');
        const back = binding.footer.querySelector<HTMLIonButtonElement>('ion-buttons[slot=start] ion-button');
        if (
          !bar ||
          !input ||
          !back ||
          !binding.footer.matches('ion-footer') ||
          !inFixedToolbar(bar) ||
          !inFixedToolbar(back) ||
          bar.closest(excluded) ||
          !bar.classList.contains('ios') ||
          bar.classList.contains('searchbar-classic')
        )
          continue;
        if (
          bar.color ||
          back.fill !== 'default' ||
          back.color ||
          bar.maxlength != null ||
          bar.minlength != null ||
          bar.inputmode ||
          bar.enterkeyhint ||
          !['off', 'none'].includes(bar.autocapitalize) ||
          bar.autocomplete !== 'off' ||
          ![false, 'off', undefined].includes(bar.autocorrect) ||
          bar.spellcheck ||
          bar.showClearButton !== 'always' ||
          bar.clearIcon
        )
          continue;
        if (bar.showCancelButton !== 'never' || bar.type !== 'search' || !getComputedStyle(input).backdropFilter.includes('blur')) continue;
        const fabButton = binding.trigger as HTMLIonFabButtonElement;
        const nativeTrigger = fabButton.shadowRoot?.querySelector<HTMLElement>('[part=native]');
        if (
          binding.trigger.closest(excluded) ||
          back.closest(excluded) ||
          back.disabled ||
          fabButton.disabled ||
          fabButton.color ||
          fabButton.type !== 'button' ||
          fabButton.href ||
          !nativeTrigger ||
          getComputedStyle(fabButton).backgroundColor !== 'rgba(0, 0, 0, 0)' ||
          !getComputedStyle(nativeTrigger).backdropFilter.includes('blur')
        )
          continue;
        const trigger = readIcon(binding.trigger, binding.trigger, candidate);
        const searchIcon = bar.querySelector<HTMLElement>('.searchbar-search-icon');
        const field = searchIcon && readIcon(searchIcon, bar, candidate);
        if (!trigger || !field) continue;
        field.label = '';
        field.accessibilityLabel = bar.getAttribute('aria-label') ?? input.getAttribute('aria-label') ?? 'Search';
        const state = states.get(binding) ?? install(binding, bar, input);
        state.layout = JSON.stringify([
          innerWidth,
          innerHeight,
          candidate.control.x,
          candidate.control.y,
          candidate.control.width,
          candidate.control.height,
          candidate.control.rtl,
          trigger.x,
          trigger.y,
          trigger.width,
          trigger.height,
        ]);
        if (state.rejectedLayout === state.layout) continue;
        candidate.control.search = {
          id: id(bar),
          field,
          trigger,
          closeId: id(back),
          active: binding.active,
          available: true,
          focused: binding.focused,
          value: bar.value ?? '',
          placeholder: bar.placeholder ?? '',
          disabled: bar.disabled,
          editSequence: state.editSequence,
          valueVersion: state.valueVersion,
        };
        state.last = candidate.control.search;
        candidate.sources = [binding.tabBar, binding.trigger.closest<HTMLElement>('ion-fab') ?? binding.trigger, binding.footer];
        candidate.actions.set(id(binding.trigger), binding.trigger);
        candidate.actions.set(id(back), back);
      }
      for (const [candidate, configuration] of inactive) candidate.control.search ??= configuration;
      const groups = candidates.filter((c) => c.control.search);
      return candidates.filter((c) => !groups.some((group) => group !== c && group.sources?.some((source) => source.contains(c.element))));
    },
    projected,
    begin(binding: NativeSearchBinding, revision: number) {
      const state = states.get(binding);
      if (state) state.minimumRevision = revision;
    },
    release(element: HTMLElement) {
      for (const binding of states.keys()) if (binding.footer === element) this.retire(binding);
    },
    reject(ids: string[]) {
      states.forEach((state) => {
        if (ids.includes(id(state.binding.tabBar))) state.rejectedLayout = state.layout;
      });
    },
    event(event: ShellSearchEvent) {
      const state = Array.from(states.values()).find((s) => id(s.bar) === event.id && projected(s.binding));
      if (
        !state ||
        !state.binding.active ||
        ((event.phase === 'input' || event.phase === 'clear') && event.valueVersion !== state.valueVersion) ||
        event.revision < state.minimumRevision ||
        event.sequence <= state.editSequence ||
        state.bar.disabled
      )
        return;
      state.editSequence = event.sequence;
      const { input, binding } = state;
      if (event.phase === 'input') {
        if (state.composing !== event.composing)
          input.dispatchEvent(
            new CompositionEvent(event.composing ? 'compositionstart' : 'compositionend', { bubbles: true, data: event.value }),
          );
        state.composing = event.composing;
        input.value = event.value;
        state.applyingInput = true;
        try {
          input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true, isComposing: event.composing }));
        } finally {
          state.applyingInput = false;
        }
      } else if (event.phase === 'clear') {
        state.bar.querySelector<HTMLButtonElement>('.searchbar-clear-button')?.click();
      } else if (event.phase === 'commit') {
        input.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        if (state.focused === (event.phase === 'focus')) return;
        state.focused = binding.focused = event.phase === 'focus';
        input.dispatchEvent(new FocusEvent(event.phase, { composed: true }));
      }
      schedule();
    },
    retire(binding: NativeSearchBinding) {
      const state = states.get(binding);
      if (state?.focused) {
        state.focused = false;
        state.input.dispatchEvent(new FocusEvent('blur'));
      }
      binding.active = binding.focused = false;
    },
    destroy() {
      states.forEach((state) => {
        this.retire(state.binding);
        state.restore();
      });
      states.clear();
    },
  };
};
