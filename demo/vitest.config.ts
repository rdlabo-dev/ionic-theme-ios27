import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@ionic-theme/capacitor-native-ui/integration': new URL(
        '../packages/capacitor-native-ui/src/native-integration/index.ts',
        import.meta.url,
      ).pathname,
    },
  },
  test: {
    setupFiles: ['src/test-setup.ts'],
    server: { deps: { inline: [/@ionic\/angular/, /@ionic\/core/, /ionicons/, /@rdlabo\/ionic-theme-/] } },
  },
});
