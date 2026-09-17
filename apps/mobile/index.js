// Hermes (RN's JS engine) doesn't ship `Intl.PluralRules`, which `@carrental/i18n`'s translator
// needs for every ICU plural message (e.g. `site.search.available`). Without this, formatting
// throws and the translator's catch-all falls back to the raw, un-interpolated ICU source string
// instead of the intended text — polyfill before anything else (i18n, router) can run.
import '@formatjs/intl-pluralrules/polyfill';
import '@formatjs/intl-pluralrules/locale-data/en';
import '@formatjs/intl-pluralrules/locale-data/fr';
import '@formatjs/intl-pluralrules/locale-data/ar';

import { I18nManager } from 'react-native';

// The floating bottom tab bar's sliding indicator ((tabs)/_layout.tsx) computes its own physical
// x position by hand (equal columns, manually mirrored via `I18nManager.isRTL`) and applies it
// with `transform: translateX` from a fixed `left: 0` origin. RN's default under RTL silently
// re-anchors a `left` value to the opposite physical edge, which double-mirrors that already-
// direction-aware math and sends the indicator off-screen. Disabling it repo-wide keeps that one
// component correct; nothing else in the app relies on the auto-swap (RTL-dependent positioning
// elsewhere is done explicitly with an `I18nManager.isRTL` check).
I18nManager.doLeftAndRightSwapInRTL = false;

import 'expo-router/entry';
