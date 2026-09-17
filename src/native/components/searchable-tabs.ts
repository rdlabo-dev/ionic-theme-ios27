import { getNativeSearchBindings, requestNativeSearch } from '../../native-integration';
import type { NativeSearchBinding } from '../../native-integration';
import { excluded, inFixedToolbar, isShellDisabled, marker, text, visible } from '../shared/dom';
import { iconSource } from '../shared/icons';
import type { Candidate } from '../shared/candidate';
import type { ShellItem, ShellSearch, ShellSearchEvent } from '../definitions';

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
  keyboardHidden?: boolean;
  last?: ShellSearch;
  layout?: string;
  rejectedLayout?: string;
  restore: () => void;
}

export const createSearchSupport = (doc: Document, id: (element: Element) => string, schedule: () => void) => {
  const states = new Map<NativeSearchBinding, SearchState>();
  let keyboardVisible = false;
  let heldKeyboardResize: string | null = null;
  let keyboardResizeGeneration = 0;
  type KeyboardPlugin = {
    setResizeMode?: (options: { mode: string }) => Promise<void>;
    getResizeMode?: () => Promise<{ mode?: string }>;
  };
  const keyboardPlugin = (): KeyboardPlugin | undefined =>
    (
      doc.defaultView as Window & {
        Capacitor?: { Plugins?: { Keyboard?: KeyboardPlugin } };
      }
    )?.Capacitor?.Plugins?.Keyboard;
  const projected = (binding: NativeSearchBinding) => binding.footer.hasAttribute(marker);
  // Hold Cap resize at none while search is active so WebView shrink does not fight UISearchTab.
  const holdKeyboardResize = () => {
    const keyboard = keyboardPlugin();
    if (!keyboard?.setResizeMode || heldKeyboardResize !== null) return;
    const setResizeMode = keyboard.setResizeMode.bind(keyboard);
    const generation = ++keyboardResizeGeneration;
    heldKeyboardResize = 'native';
    void (async () => {
      let restoreMode = 'native';
      try {
        const current = await keyboard.getResizeMode?.();
        if (typeof current?.mode === 'string') restoreMode = current.mode;
      } catch {
        /* keep default restore target */
      }
      if (generation !== keyboardResizeGeneration) return;
      heldKeyboardResize = restoreMode;
      try {
        await setResizeMode({ mode: 'none' });
      } catch {
        if (generation === keyboardResizeGeneration) heldKeyboardResize = null;
        return;
      }
      // Leave raced ahead of setResizeMode(none) — undo the stale none apply.
      if (generation !== keyboardResizeGeneration) void setResizeMode({ mode: restoreMode }).catch(() => undefined);
    })();
  };
  const hasActiveProjection = () => [...states.keys()].some((binding) => binding.active && projected(binding));
  const releaseKeyboardResize = () => {
    if (hasActiveProjection()) return;
    keyboardResizeGeneration++;
    const mode = heldKeyboardResize;
    heldKeyboardResize = null;
    if (!mode) return;
    void keyboardPlugin()?.setResizeMode?.({ mode });
  };
  const isCurrent = (state: SearchState) =>
    state.bar.isConnected &&
    state.binding.footer.querySelector('ion-searchbar') === state.bar &&
    state.bar.querySelector('input.searchbar-input') === state.input;
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
    keyboard(visible: boolean) {
      keyboardVisible = visible;
      if (!visible) {
        states.forEach((state) => (state.keyboardHidden = false));
        releaseKeyboardResize();
      }
      schedule();
    },
    keepSearchTabsVisible() {
      if (!keyboardVisible) return;
      for (const [binding, state] of states) {
        // Ionic hides bottom tabs for every keyboard, including native search.
        // Correct only that framework class; application styles still apply.
        if (binding.active && projected(binding) && binding.tabBar.classList.contains('tab-bar-hidden')) {
          state.keyboardHidden = true;
          binding.tabBar.classList.remove('tab-bar-hidden');
        }
      }
    },
    decorate(candidates: Candidate[], blocked: (element: HTMLElement) => boolean): Candidate[] {
      const bindings = getNativeSearchBindings(doc);
      for (const [binding, state] of states) {
        if (!bindings.includes(binding) || !isCurrent(state)) {
          this.retire(binding);
          state.restore();
          states.delete(binding);
        }
      }
      const inactive: [Candidate, ShellSearch][] = [];
      const pageHidden = (element: HTMLElement) => !!element.closest('.ion-page-hidden, .ion-page-invisible');
      const retainInactive = (candidate: Candidate, state?: SearchState, keepAvailable = false) => {
        // Keep ShellSearchController across page transitions instead of demoting to UITabBar.
        // While the searchable page is only blocked mid-transition (not yet hidden), keep
        // available:true so native chrome does not swap to ordinary idleBar over album content.
        if (state?.last) inactive.push([candidate, { ...state.last, active: false, available: keepAvailable, focused: false }]);
      };
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
        if (isShellDisabled(fab) || isShellDisabled(binding.footer)) continue;
        const pageUnavailable = blocked(binding.footer) || !!binding.footer.closest(excluded);
        const existing = states.get(binding);
        if (pageUnavailable) {
          retainInactive(candidate, existing, !!existing?.last?.available && !pageHidden(binding.footer));
          if (existing?.last) continue;
          // First registration during a transition: fall through and measure available:false.
        }
        if (binding.active && existing && isCurrent(existing) && existing.last && !pageUnavailable) {
          const back = binding.footer.querySelector<HTMLIonButtonElement>('ion-buttons[slot=start] ion-button');
          // Close must stay eligible; otherwise fall through and demote instead of caching active.
          if (back && !back.disabled && !back.closest(excluded)) {
            candidate.control.search = {
              ...existing.last,
              active: true,
              available: true,
              focused: binding.focused,
              value: existing.bar.value ?? '',
              placeholder: existing.bar.placeholder ?? '',
              disabled: existing.bar.disabled,
              editSequence: existing.editSequence,
              valueVersion: existing.valueVersion,
            };
            existing.last = candidate.control.search;
            candidate.sources = [binding.tabBar, binding.trigger.closest<HTMLElement>('ion-fab') ?? binding.trigger, binding.footer];
            candidate.actions.set(existing.last.trigger.id, binding.trigger);
            candidate.actions.set(existing.last.closeId, back);
            continue;
          }
        }
        if (!visible(binding.trigger) && !pageUnavailable) {
          retainInactive(candidate, existing);
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
          (!pageUnavailable && bar.closest(excluded)) ||
          !bar.classList.contains('ios') ||
          bar.classList.contains('searchbar-classic')
        ) {
          retainInactive(candidate, existing);
          continue;
        }
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
        ) {
          retainInactive(candidate, existing);
          continue;
        }
        if (bar.showCancelButton !== 'never' || bar.type !== 'search' || !getComputedStyle(input).backdropFilter.includes('blur')) {
          retainInactive(candidate, existing);
          continue;
        }
        const fabButton = binding.trigger as HTMLIonFabButtonElement;
        const nativeTrigger = fabButton.shadowRoot?.querySelector<HTMLElement>('[part=native]');
        if (
          (!pageUnavailable && binding.trigger.closest(excluded)) ||
          (!pageUnavailable && back.closest(excluded)) ||
          back.disabled ||
          fabButton.disabled ||
          fabButton.color ||
          fabButton.type !== 'button' ||
          fabButton.href ||
          !nativeTrigger ||
          getComputedStyle(fabButton).backgroundColor !== 'rgba(0, 0, 0, 0)' ||
          !getComputedStyle(nativeTrigger).backdropFilter.includes('blur')
        ) {
          retainInactive(candidate, existing);
          continue;
        }
        const state = existing ?? install(binding, bar, input);
        const trigger = readIcon(binding.trigger, binding.trigger, candidate);
        const searchIcon = bar.querySelector<HTMLElement>('.searchbar-search-icon');
        const field = searchIcon && readIcon(searchIcon, bar, candidate);
        if (!trigger || !field) {
          retainInactive(candidate, state);
          continue;
        }
        field.label = '';
        field.accessibilityLabel = bar.getAttribute('aria-label') ?? input.getAttribute('aria-label') ?? 'Search';
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
          candidate.control.items,
          candidate.icons.map(({ source }) => source),
          field,
          trigger,
          bar.placeholder,
          bar.disabled,
        ]);
        if (state.rejectedLayout === state.layout) {
          retainInactive(candidate, state);
          continue;
        }
        const available = !pageUnavailable && visible(binding.trigger);
        candidate.control.search = {
          id: id(input),
          field,
          trigger,
          closeId: id(back),
          active: available && binding.active,
          available,
          focused: available && binding.focused,
          value: bar.value ?? '',
          placeholder: bar.placeholder ?? '',
          disabled: bar.disabled,
          editSequence: state.editSequence,
          valueVersion: state.valueVersion,
        };
        state.last = candidate.control.search;
        if (available) {
          candidate.sources = [binding.tabBar, binding.trigger.closest<HTMLElement>('ion-fab') ?? binding.trigger, binding.footer];
          candidate.actions.set(id(binding.trigger), binding.trigger);
          candidate.actions.set(id(back), back);
        }
      }
      for (const [candidate, configuration] of inactive) candidate.control.search ??= configuration;
      const groups = candidates.filter((c) => c.control.search);
      return candidates.filter((c) => !groups.some((group) => group !== c && group.sources?.some((source) => source.contains(c.element))));
    },
    projected,
    hasActive() {
      for (const [binding] of states) if (binding.active && projected(binding)) return true;
      return false;
    },
    begin(binding: NativeSearchBinding, revision: number) {
      const state = states.get(binding);
      if (state) state.minimumRevision = revision;
    },
    /** Enter / focus / leave. `focused` is ignored when leaving. */
    setStatus(binding: NativeSearchBinding, active: boolean, focused = false) {
      if (!active) {
        this.retire(binding);
        return;
      }
      binding.active = true;
      // Projection intent only. Ionic focus/blur events still wait for the native phase.
      binding.focused = focused;
      holdKeyboardResize();
    },
    release(element: HTMLElement) {
      for (const binding of states.keys()) if (binding.footer === element) this.retire(binding);
    },
    reject(ids: string[]) {
      states.forEach((state) => {
        if (ids.includes(id(state.binding.tabBar))) {
          state.rejectedLayout = state.layout;
          // UIKit removed the search surface — do not reuse its cache; project ordinary tabs.
          state.last = undefined;
        }
      });
    },
    event(event: ShellSearchEvent) {
      const state = Array.from(states.values()).find((s) => id(s.input) === event.id && projected(s.binding) && isCurrent(s));
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
      if (state?.keyboardHidden && keyboardVisible) binding.tabBar.classList.add('tab-bar-hidden');
      if (state) state.keyboardHidden = false;
      if (state?.focused) {
        state.focused = false;
        state.input.dispatchEvent(new FocusEvent('blur'));
      }
      binding.active = binding.focused = false;
      releaseKeyboardResize();
    },
    destroy() {
      states.forEach((state) => {
        this.retire(state.binding);
        state.restore();
      });
      states.clear();
      releaseKeyboardResize();
    },
  };
};
