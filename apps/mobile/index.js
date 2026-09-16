// Hermes (RN's JS engine) doesn't ship `Intl.PluralRules`, which `@carrental/i18n`'s translator
// needs for every ICU plural message (e.g. `site.search.available`). Without this, formatting
// throws and the translator's catch-all falls back to the raw, un-interpolated ICU source string
// instead of the intended text — polyfill before anything else (i18n, router) can run.
import '@formatjs/intl-pluralrules/polyfill';
import '@formatjs/intl-pluralrules/locale-data/en';
import '@formatjs/intl-pluralrules/locale-data/fr';
import '@formatjs/intl-pluralrules/locale-data/ar';

import 'expo-router/entry';
