import { expect, test } from '@playwright/test';

for (const disabled of ['ios-theme-disabled', 'ios26-disabled']) {
  for (const tag of ['ion-card-header', 'ion-card-title', 'ion-card-subtitle', 'ion-card-content']) {
    test(`${tag} children preserve Ionic styles with ${disabled}`, async ({ page }) => {
      await page.goto('/main/index/card');
      await page.waitForSelector('ion-card-title.hydrated');
      const styles = await page.evaluate(
        async ({ disabled, tag }) => {
          const create = (parentDisabled: boolean) => {
            const card = document.createElement('ion-card');
            card.classList.toggle(disabled, parentDisabled);
            // Keep inherited parent values equal; compare the child's own Ionic rules.
            card.style.cssText = '--color: black; font-size:16px;line-height:1.29';
            card.innerHTML = `<ion-card-header class="${disabled}"><ion-card-title class="${disabled}">Title</ion-card-title><ion-card-subtitle class="${disabled}">Subtitle</ion-card-subtitle></ion-card-header><ion-card-content class="${disabled}"><p>Content</p></ion-card-content>`;
            card.querySelectorAll('*').forEach((el) => el.classList.toggle(disabled, el.localName === tag));
            document.body.append(card);
            return card;
          };
          const cards = [create(false), create(true)];
          await Promise.all(
            cards
              .flatMap((card) => [card, ...card.querySelectorAll('*')])
              .map((el: Element & { componentOnReady?: () => Promise<unknown> }) => el.componentOnReady?.()),
          );
          const result = cards.map((card) =>
            [...card.querySelectorAll(tag)].map((el) => {
              const s = getComputedStyle(el);
              return { padding: s.padding, fontSize: s.fontSize, fontWeight: s.fontWeight, lineHeight: s.lineHeight, color: s.color };
            }),
          );
          cards.forEach((card) => card.remove());
          return result;
        },
        { disabled, tag },
      );
      expect(styles[0]).toEqual(styles[1]);
    });
  }
}
