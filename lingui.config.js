import { defineConfig } from '@lingui/cli';
import { formatter } from '@lingui/format-po';

export default defineConfig({
  sourceLocale: 'en',
  locales: ['en', 'ru'],
  format: formatter({ lineNumbers: false }),
  compileNamespace: 'es',
  catalogs: [{ path: '<rootDir>/web/locales/{locale}/messages', include: ['<rootDir>/web/i18n/messages'] }]
});
