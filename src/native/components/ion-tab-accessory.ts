import { createCandidate } from '../shared/candidate';
import type { Candidate, Identify } from '../shared/candidate';
import { frame, text } from '../shared/dom';

export const tag = 'ion-toolbar';
export const selector = 'ion-toolbar.tab-accessory, ion-toolbar.ios-theme-tab-accessory';
export const shadowSelector = 'ion-button, ion-label, ion-progress-bar, img, [data-tab-accessory="artwork"], [data-tab-accessory="elapsed"], [data-tab-accessory="duration"]';
export const tracksMotion = false;

const playSelector = 'ion-button[data-tab-accessory="play"], ion-button[slot="end"]';

const parseProgress = (element: HTMLElement): number | undefined => {
  const bar = element.querySelector<HTMLElement>('ion-progress-bar, [data-tab-accessory="progress"]');
  if (bar) {
    const attr = bar.getAttribute('value') ?? (bar as HTMLElement & { value?: number }).value;
    const numeric = typeof attr === 'number' ? attr : parseFloat(String(attr ?? ''));
    if (Number.isFinite(numeric)) return Math.round(numeric * 100) / 100;
  }
  const css = parseFloat(getComputedStyle(element).getPropertyValue('--progress'));
  return Number.isFinite(css) ? css : undefined;
};

const progressColor = (element: HTMLElement): string | undefined => {
  const bar = element.querySelector<HTMLElement>('ion-progress-bar, [data-tab-accessory="progress"]');
  if (!bar) return;
  const style = getComputedStyle(bar);
  const value = style.getPropertyValue('--progress-background').trim() || style.color;
  return value || undefined;
};

export const read = (element: HTMLElement, id: Identify): Candidate | undefined => {
  if (!element.classList.contains('tab-accessory') && !element.classList.contains('ios-theme-tab-accessory')) return;
  if (element.closest('ion-content, ion-modal, ion-popover, ion-menu')) return;
  const play = element.querySelector<HTMLElement>(playSelector);
  if (!play) return;

  const candidate = createCandidate(element, tag, id);
  const iconName = play.querySelector('ion-icon')?.getAttribute('name') ?? '';
  const selected = /pause/i.test(iconName);
  const label = play.getAttribute('aria-label')?.trim() || text(play) || (selected ? 'Pause' : 'Play');
  const playId = id(play);
  const playRect = play.getBoundingClientRect();
  const hostRect = element.getBoundingClientRect();
  const playFrame =
    playRect.width > 0 && playRect.height > 0
      ? frame(playRect, hostRect)
      : { x: Math.max(0, hostRect.width - 44), y: Math.max(0, (hostRect.height - 44) / 2), width: 44, height: 44 };
  candidate.control.items.push({
    id: playId,
    ...playFrame,
    label,
    accessibilityLabel: play.getAttribute('aria-label') ?? label,
    disabled: false,
    selected,
    fontSize: 17,
    fontWeight: 400,
    color: 'currentColor',
  });
  candidate.actions.set(playId, play);
  candidate.actions.set(candidate.control.id, element);

  const artworkEl =
    element.querySelector<HTMLElement>('[data-tab-accessory="artwork"]') ??
    element.querySelector<HTMLElement>('[slot="start"]:not(ion-buttons)');
  if (artworkEl) {
    const artworkRect = artworkEl.getBoundingClientRect();
    const artworkId = id(artworkEl);
    const artworkFrame =
      artworkRect.width > 0 && artworkRect.height > 0
        ? frame(artworkRect, hostRect)
        : { x: 12, y: Math.max(0, (hostRect.height - 36) / 2), width: 36, height: 36 };
    candidate.control.items.push({
      id: artworkId,
      ...artworkFrame,
      label: artworkEl.getAttribute('aria-label')?.trim() || 'Artwork',
      accessibilityLabel: artworkEl.getAttribute('aria-label') ?? 'Artwork',
      disabled: false,
      selected: false,
      fontSize: 17,
      fontWeight: 400,
      color: 'currentColor',
    });
    candidate.actions.set(artworkId, artworkEl);
  }

  const title =
    element.querySelector('[data-tab-accessory="title"]')?.textContent?.trim() ||
    element.querySelector('ion-label h2')?.textContent?.trim() ||
    text(element.querySelector('ion-label') ?? element);
  const subtitle =
    element.querySelector('[data-tab-accessory="subtitle"]')?.textContent?.trim() ||
    element.querySelector('ion-label p')?.textContent?.trim() ||
    undefined;
  const artwork =
    (element.querySelector('[data-tab-accessory="artwork"]') as HTMLImageElement | null)?.currentSrc ||
    (element.querySelector('[data-tab-accessory="artwork"]') as HTMLImageElement | null)?.src ||
    (element.querySelector('ion-thumbnail img, img') as HTMLImageElement | null)?.currentSrc ||
    (element.querySelector('ion-thumbnail img, img') as HTMLImageElement | null)?.src ||
    undefined;

  const elapsed = element.querySelector('[data-tab-accessory="elapsed"]')?.textContent?.trim() || undefined;
  const duration = element.querySelector('[data-tab-accessory="duration"]')?.textContent?.trim() || undefined;

  if (title) candidate.control.title = title;
  if (subtitle) candidate.control.subtitle = subtitle;
  if (artwork) candidate.control.artworkUrl = artwork;
  if (elapsed) candidate.control.elapsed = elapsed;
  if (duration) candidate.control.duration = duration;
  const progress = parseProgress(element);
  if (progress !== undefined) candidate.control.progress = progress;
  const color = progressColor(element);
  if (color) candidate.control.progressColor = color;
  return candidate;
};
