---
title: Keep lists consistent with ESLint
---

# Keep lists consistent with ESLint

Catch missing list groups before they reach the screen. In Ionic Angular apps, `@rdlabo/eslint-plugin-rules` checks the markup used by iOS 27.

## Enable the list check

This setup targets Ionic Angular 9 with Angular / Angular ESLint 21–22. Install plugin 22 in an app that already has Angular ESLint configured:

```sh
npm install --save-dev @rdlabo/eslint-plugin-rules@22
```

Add the plugin to the existing HTML config in `eslint.config.mjs` (or the equivalent CommonJS config). Keep `angular.processInlineTemplates` on the TypeScript config so inline templates are checked too:

```js
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import rdlabo from '@rdlabo/eslint-plugin-rules';

export default tseslint.config(
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    processor: angular.processInlineTemplates,
  },
  {
    files: ['**/*.html'],
    languageOptions: { parser: angular.templateParser },
    plugins: { '@rdlabo/rules': rdlabo },
    rules: {
      '@rdlabo/rules/require-ion-item-group': 'error',
    },
  },
);
```

Merge these entries into your existing configuration to retain its other checks. Already using `rdlabo.configs.recommended`? It includes this rule.

## See what it catches

This template is reported:

```html
<ion-list [inset]="true">
  <ion-item>Notifications</ion-item>
</ion-list>
```

Group the items and import `IonItemGroup` in the standalone component:

```html
<ion-list [inset]="true">
  <ion-item-group>
    <ion-item>Notifications</ion-item>
  </ion-item-group>
</ion-list>
```

The rule checks all `ion-list` elements, including non-inset lists. Radio, reorder, and accordion groups are also supported. It checks Angular templates; it does not inspect React or Vue templates.

See [Using ion-item-group](using-ion-item-group.md) for layout examples and the [rule reference](https://docs.rdlabo.dev/projects/eslint-plugin-rules/docs/rules/require-ion-item-group) for supported structures and automatic fixes.

## Keep it checked

Run this locally and in CI after installing dependencies:

```sh
npx eslint 'src/**/*.{ts,html}' --max-warnings 0
```

If your Angular project uses a different source directory, adjust the path. Keep a visual check for spacing, colors, and transitions; this rule checks list structure.
