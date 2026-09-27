# Play Store release — carrental-v1.0.0-code1

Built locally with Gradle (no EAS/Expo account involved). Regenerate with:

```
cd apps/mobile
APP_VARIANT=production EXPO_PUBLIC_API_URL=https://car-rental-api.mohammad-erhim.dev/v1 \
  npx expo prebuild --platform android --clean
# then re-apply the release signingConfig block to android/app/build.gradle — see
# "Signing" below, it does not survive prebuild since it's hand-added, not a config plugin.
cd android
APP_VARIANT=production EXPO_PUBLIC_API_URL=https://car-rental-api.mohammad-erhim.dev/v1 \
  ./gradlew bundleRelease   # -> app/build/outputs/bundle/release/app-release.aab
```

## What's in this folder

| File | Purpose |
| --- | --- |
| `carrental-v1.0.0-code1.aab` | **Upload this to Play Console.** Android App Bundle — Play generates per-device APKs from it. |
| `carrental-v1.0.0-code1.apk` | Universal APK for manual/sideload testing (`adb install`) only. Play Console does not want this. |

This folder is gitignored (build output, regenerable, large) — see the root `.gitignore` entry. If you need to hand these to someone else, copy them out; don't rely on this folder surviving `git clean`.

## Build identity

- `applicationId`: `com.carrental.app` (production variant — `app.config.ts`'s `BUNDLE_ID.production`)
- `versionName` / `versionCode`: `1.0.0` / `1` — **first submission**. There is no EAS remote version bookkeeping in this bare/local workflow (`eas.json`'s `autoIncrement` only applies to EAS Build), so every future release must bump `versionCode` in `android/app/build.gradle` by hand before rebuilding — Play Console rejects a re-upload with the same or lower `versionCode`.
- `compileSdkVersion` / `targetSdkVersion`: **36** (Android 16) — meets Play's current target-API requirement (deadline Aug 31 2026, extension to Nov 1 2026).
- `minSdkVersion`: 28 (Android 9) — raised from 24 after this build.
- Native libraries are 16 KB memory-page-size aligned (verified: `PT_LOAD` segments in `libhermes.so`, `libjsi.so`, etc. report `0x4000` alignment) — this is the separate Play requirement from the target-API bump and is satisfied by React Native 0.81 / Expo SDK 54, which this app now runs.
- Built with Expo SDK 54 / React Native 0.81.5, upgraded incrementally from SDK 51 in this same session (51→52→53→54).

## Signing

- Keystore: `credentials/android-release.keystore`, alias `carrental-release`. Passwords in `credentials/release.keystore.properties` (both gitignored, machine-local — **not duplicated into this folder**).
- **Back this keystore up somewhere durable and private (e.g. a password manager or encrypted offsite storage) before you do anything else.** If this is your first-ever upload to Play Console, enroll in Play App Signing when prompted — Google then holds the signing key and re-signs what it serves to users, but it still needs *this* upload key for every future `bundleRelease`. Lose it with Play App Signing off, and you can never publish an update to this `applicationId` again; with Play App Signing on, recovery is possible but requires a Google support request and identity verification.
- `android/app/build.gradle`'s `signingConfigs.release` block reading from `credentials/release.keystore.properties` is a **hand edit**, not produced by any Expo config plugin — `expo prebuild` regenerates the whole `android/` folder from scratch and silently drops it, along with the CAMERA/READ_MEDIA_IMAGES permission removal already baked into `app.config.ts`. Re-apply the signing block (or diff it back in) after every `expo prebuild`.

## Permissions

`CAMERA`, `READ_MEDIA_IMAGES` were removed with `expo-image-picker` (uninstalled — nothing in `src/`
uses it). `READ_EXTERNAL_STORAGE`/`WRITE_EXTERNAL_STORAGE` are still present in the generated
manifest despite that removal — they're coming from another autolinked native module's merged
manifest, not `app.config.ts`'s `android.permissions` list. Not tracked down in this pass; worth
finding before the Play Console permissions declaration is finalized.

## Verified before this build (emulator, production API)

- App boots, renders, and talks to the real production API (`https://car-rental-api.mohammad-erhim.dev/v1`) — home feed, vehicle classes, and the location search all load live data.
- Release APK installed via `adb install -r` on a running emulator and launched cleanly onboarding
  -> home feed with live data. Signature confirmed as the `carrental-release` key (not debug) via
  `apksigner verify --print-certs`; AAB signature confirmed via `jarsigner -verify`.
- Fixed during the SDK 51→54 upgrade pass (regressions from that dependency jump, not pre-existing):
  - `@gorhom/bottom-sheet` blank/white-screen crash on open → bumped 4.6.4 → 5.2.14 (the only version line with Reanimated 4 support).
  - Same bottom sheet rendering at the wrong height → v5 defaults `enableDynamicSizing` to `true`, which fights explicit `snapPoints`; set `enableDynamicSizing={false}`.
  - Location picker sheet had no backdrop → added `BottomSheetBackdrop` (`pressBehavior="close"`) so tapping outside dismisses it.
- Also fixed: the checkout form's `<Screen>` was missing `keyboardAvoiding`, so the keyboard covered the lower input fields — added it (not retested live in-emulator, but it's the same prop this codebase already uses successfully on every other form screen).

## Rebuilt 2026-09-28 — same version, newer code

`versionCode`/`versionName` are unchanged (`1` / `1.0.0`): nothing in this repo indicates the prior
`carrental-v1.0.0-code1` artifact was actually uploaded to Play Console yet (see the checklist
below, item 11 was still open), so this rebuild replaces the prior local `.aab`/`.apk` in place.
**If you already uploaded the previous build to any Play Console track, bump `versionCode` in
`android/app/build.gradle` before uploading this one — Play rejects a re-upload at the same code.**

Commits folded into this rebuild since the prior one (`697af34`, 2026-09-27):

- `chore(mobile): raise minSdkVersion to 28 (Android 9)` — see the `minSdkVersion` note above.
- `feat(mobile): redesign splash screen` + `fix(mobile): eliminate splash-to-animation white flash, size jump, and black flash`
- `fix(mobile): persist session hint before state change in applySession`
- `fix(deploy): rewrite refresh cookie Path for the mobile API domain`
- `fix(mobile): mandatory language-restart, splash race, network error handling`
- `fix(layout): enhance splash screen handling by integrating i18n and theme readiness checks`
- `feat(theme): add onReady callback to ThemeProvider for theme preference readiness`
- `fix(tabs): adjust animation parameters for LiquidTabBar to improve performance and responsiveness`

## Still needed before this can actually go live in Play Console

None of this is done yet — it's Play Console configuration and store-listing content, not code:

1. **Play Console account + app entry** — create the app, confirm it's under the right developer account.
2. **Store listing** — title, short/full description, app icon, feature graphic, phone screenshots (`store-assets/raw|framed` already has the folder structure for these — screenshots themselves still need capturing/generating), promo video if you want one.
3. **Content rating questionnaire.**
4. **Target audience & content** section (age groups, and whether the app appeals to children — affects Families policy applicability).
5. **Data safety form** — declare what's actually collected/shared: account email (auth), payment details (handled by Stripe — declare per Play's guidance on payment SDKs), device location (only if the user taps "Allow location access" in the location picker — it's optional/foreground-only, `ACCESS_FINE_LOCATION`/`ACCESS_COARSE_LOCATION`).
6. **Privacy policy URL** — required, must be a live, publicly reachable page before submission.
7. **Ads declaration** (this app has none, but Play still asks).
8. **App access** — if any part of the app is gated behind login, provide Play reviewers a test account (or a note on how to reach content without one).
9. **Government apps / financial features declarations** if applicable (car rental + Stripe payments may trigger Play's financial-services questionnaire — check when you reach that step).
10. **Countries/pricing & distribution.**
11. **Upload `carrental-v1.0.0-code1.aab`** to a testing track first (internal testing is the fastest closed track) before promoting to production — new Play Console accounts are additionally required to run a closed test with 12+ testers for 14 days before their first production release.
