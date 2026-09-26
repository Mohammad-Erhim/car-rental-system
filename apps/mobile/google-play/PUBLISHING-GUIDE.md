# Publishing Car Rental on Google Play — step by step

This guide takes the app from **"I have a Google account"** to **"Car Rental is live on Google
Play"**. It assumes a **brand-new Play developer account** and uses the files in this folder for
every upload. Work through the steps in order: several have waiting periods, so starting early
matters.

| Step | What                                          | Typical time                                  |
| ---- | --------------------------------------------- | --------------------------------------------- |
| 0    | Pre-flight fixes in the app (read this first) | 1–2 hours                                     |
| 1    | Create + verify the developer account         | 1–3 days (identity check)                     |
| 2    | Build the release `.aab`                      | 30–60 min                                     |
| 3    | Create the app in Play Console                | 5 min                                         |
| 4    | App content declarations                      | 45 min                                        |
| 5    | Store listing (icon, graphics, screenshots…)  | 30 min                                        |
| 6    | Internal test → closed test                   | **14 days minimum** for new personal accounts |
| 7    | Apply for production + release                | 1–7+ days for review                          |

---

## What's in this folder — and where each file goes

| Folder / file                                      | Play Console field                                                  | Spec Google enforces                                      |
| -------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| `1-app-icon/play-store-icon-512.png`               | Store listing → **App icon**                                        | 512×512, 32-bit PNG, ≤ 1 MB                               |
| `2-feature-graphic/feature-graphic-1024x500.png`   | Store listing → **Feature graphic**                                 | 1024×500, JPEG or 24-bit PNG, **no alpha**                |
| `3-phone-screenshots/01…06-*.png`                  | Store listing → **Phone screenshots** (upload in 01→06 order)       | 2–8 images, 9:16, 24-bit PNG, no alpha — these: 1440×2560 |
| `4-promo-video/promo-video-1920x1080.mp4`          | Upload to **YouTube**, then paste the link in Store listing → Video | YouTube URL, public or unlisted, ads off                  |
| `4-promo-video/youtube-thumbnail-1280x720.png`     | YouTube → custom thumbnail                                          | 1280×720, ≤ 2 MB                                          |
| `4-promo-video/promo-video-vertical-1080x1920.mp4` | Optional: YouTube Shorts / Instagram / TikTok ads                   | —                                                         |
| `5-app-captures/*.png`                             | **Not for upload** — the 6 original device captures the designs use | 1344×2992 (ratio 2.23:1; Play rejects > 2:1)              |
| `source/`                                          | Nothing — HTML/JS sources to re-render every asset above            | see `source/README.md`                                    |

> The raw captures in `5-app-captures/` are **taller than 2:1**, and Play rejects any screenshot
> whose long side is more than twice the short side. Upload the designed 9:16 versions in
> `3-phone-screenshots/` instead.

All designs use only the app's real UI and its real launcher icon (`apps/mobile/assets/icon.png`),
with brand colors sampled from the app: emerald `#0C7951`, mint `#49D498`, ink `#0B111E`.

---

## Step 0 — Pre-flight: fix these in the app before you upload

These come from reading this repo. Each one can get an upload or a review **rejected**, so sort
them out first.

### 0.1 Target API level (upload blocker)

Google Play only accepts new apps that target a recent Android version, and the minimum rises
every year around **31 August**: API 35 (Android 15) has been required since Aug 2025, and
following that cadence API 36 (Android 16) applies from Aug 2026. This app is on **Expo SDK 51**,
which targets **API 34**, so the Play Console will refuse the `.aab` with a "target API level"
error.

Fix (pick one):

- **Recommended:** upgrade to a current Expo SDK, which ships the required `targetSdkVersion`:
  `npx expo install expo@latest --fix`, then follow Expo's upgrade notes for each SDK in between.
- **Stop-gap:** raise it in `app.config.ts` through the `expo-build-properties` plugin you already
  have:
  `android: { minSdkVersion: 24, compileSdkVersion: 36, targetSdkVersion: 36, newArchEnabled: true }`.
  Test thoroughly, because older native libraries may not build against a newer SDK.

The exact level required at upload time is shown in the Play Console error message and on
Google's "Target API level requirements" help page.

### 0.2 Remove permissions the app doesn't use

`app.config.ts` requests `CAMERA` and `READ_MEDIA_IMAGES` for driver-licence photos, but the
capture UI isn't built yet (no code calls the image picker or camera). Since 2024,
`READ_MEDIA_IMAGES` requires a **Photo and video permissions declaration**, and Google rejects
apps that request it without a core use. Until the feature ships:

- delete `'CAMERA'` and `'READ_MEDIA_IMAGES'` from `android.permissions`, and
- remove the `expo-image-picker` plugin entry (it adds the permissions itself).

When you do build licence capture, Android's system photo picker (which `expo-image-picker` uses
on Android 13+) needs no permission at all.

Location (`ACCESS_COARSE/FINE_LOCATION`) is foreground-only and optional, so it needs no special
declaration.

### 0.3 Make sure these URLs are public

| Needed for                  | URL (your public site)                        | Where it comes from                       |
| --------------------------- | --------------------------------------------- | ----------------------------------------- |
| Privacy policy (required)   | `https://<your-site-domain>/en/legal/privacy` | `apps/site/src/app/[locale]/legal/[slug]` |
| Account deletion (required) | `https://<your-site-domain>/en/account/data`  | `apps/site/src/app/[locale]/account/data` |

Google requires that apps with sign-up let users **request account deletion both in the app and
on the web**. The app already has it: Account → _Data requests & account closure_ → "Close my
account". The web page above is the second half. Open both URLs in a private browser window to
confirm they load without errors.

### 0.4 A reviewer account

Booking needs sign-in, so Google's reviewers need working credentials. Create a customer account
on production (for example `play-review@<your-domain>`) with a known password and a saved driver
profile. Make sure it **isn't** protected by a one-time code or email verification the reviewer
can't complete.

### 0.5 Copy to keep out of the listing

`packages/i18n` contains **placeholder** marketing copy: "4.9/5 from 12,000+ trips" and three
customer quotes. Play's metadata policy forbids ratings, rankings and testimonials in the listing
unless they're real and attributable, so none of it is used here. Don't add it.

### 0.6 Small UI nit visible in the screenshots

The fleet cards read **"1 bags"**. That string is `{n} bags` in
`packages/i18n/src/locales/*/common.json` (`site.home.fleet.bagsShort`), and should use ICU
plural form (`{n, plural, one {# bag} other {# bags}}`). If you fix it, recapture the affected
screens (results and dark home) and re-render (`source/README.md`).

---

## Step 1 — Create the Google Play developer account

1. **Pick the Google account that will own the app.** Use a dedicated account (for example
   `yourbrand.play@gmail.com` or a Workspace address), not a personal inbox. Ownership is hard to
   move later. Turn on 2-Step Verification: Play Console requires it.
2. Go to **https://play.google.com/console/signup** and sign in with that account.
3. **Choose the account type:**

   | Personal                                                      | Organization                                                                |
   | ------------------------------------------------------------- | --------------------------------------------------------------------------- |
   | For individuals                                               | For a registered company                                                    |
   | Government ID for verification                                | Needs a **D-U-N-S number** (free from Dun & Bradstreet, can take 1–4 weeks) |
   | **Must run a closed test: ≥ 12 testers for 14 days** (Step 6) | No testing requirement, so faster to production                             |
   | Your legal name is shown as the developer                     | The organization name is shown                                              |

   If you have a registered company, **Organization** saves you the 14-day test. Otherwise pick
   **Personal**.

4. Fill in the **developer profile**: developer name (shown on Play, e.g. "Car Rental"), contact
   email, contact phone, website (optional).
5. **Pay the one-time US $25 registration fee** by card.
6. **Verify your identity:** upload a government ID (personal) or the organization details plus
   D-U-N-S. Also verify the contact **email** and **phone** with the codes Google sends.
7. **Verify access to an Android device** (new personal accounts): install the **Google Play
   Console** app on a physical Android phone, sign in with the same account and follow the prompt.
8. Wait for the verification email. It usually takes 1–3 days. You can do Step 2 in the meantime.

---

## Step 2 — Build the release App Bundle (`.aab`)

New Play apps **must** be uploaded as an Android App Bundle (`.aab`); an `.apk` is only useful for
sideloading onto a test phone. This repo is already wired for **EAS Build** (Expo's cloud
builder), which also creates and stores your signing key.

### 2.1 One-time setup

```bash
npm install -g eas-cli
eas login                        # free Expo account at https://expo.dev/signup
cd apps/mobile
eas init                         # links the project; copy the printed projectId
```

Then either set the `EAS_PROJECT_ID` environment variable (read by `app.config.ts`) in your shell
and CI, or paste the ID into `extra.eas.projectId`.

### 2.2 Build

```bash
cd apps/mobile
pnpm build:production            # = eas build --profile production      → .aab for Play
pnpm build:production:apk        # = eas build --profile production-apk  → .apk to install on a phone
```

- The `production` profile builds `com.carrental.app` against
  `https://car-rental-api.mohammad-erhim.dev/v1` (see `eas.json`) and auto-increments the Android
  `versionCode` on every build.
- `eas-build-post-install` in `apps/mobile/package.json` runs `pnpm build:packages` on the build
  server, because the app imports `@carrental/contracts`, `theme`, `i18n` and `client` from their
  compiled `dist/`.
- On the first build EAS asks **"Generate a new Android Keystore?"** Answer **Yes**. This is your
  **upload key**. Back it up with `eas credentials` → Android → _Download keystore_, and store it
  in a password manager. Never commit it (`apps/mobile/credentials/` is gitignored).
- Download the `.aab` from the build page when it finishes.

### 2.3 Alternative: build locally (no Expo account)

This needs Android Studio (SDK + NDK), JDK 17 and your own upload keystore:

```bash
pnpm install && pnpm build:packages
cd apps/mobile
APP_VARIANT=production EXPO_PUBLIC_API_URL=https://car-rental-api.mohammad-erhim.dev/v1 \
  npx expo prebuild -p android --clean
mkdir -p credentials
keytool -genkeypair -v -storetype JKS -keystore credentials/upload.jks \
  -alias upload -keyalg RSA -keysize 2048 -validity 10000
```

Point the release build at that key in `android/app/build.gradle`:

```groovy
android {
    signingConfigs {
        release {
            storeFile file('../../credentials/upload.jks')
            storePassword System.getenv('UPLOAD_STORE_PASSWORD')
            keyAlias 'upload'
            keyPassword System.getenv('UPLOAD_KEY_PASSWORD')
        }
    }
    buildTypes { release { signingConfig signingConfigs.release } }
}
```

Then run `cd android && ./gradlew bundleRelease` (or `assembleRelease` for an `.apk`). The output is
`android/app/build/outputs/bundle/release/app-release.aab`. Note that `prebuild --clean`
regenerates `android/`, so re-apply the signing block after each prebuild. This is why EAS is the
recommended route.

---

## Step 3 — Create the app in Play Console

1. Play Console → **Home → Create app**.
2. Fill in:
   - **App name:** `Car Rental` (≤ 30 characters; you can change it later)
   - **Default language:** English (United States) – en-US
   - **App or game:** App
   - **Free or paid:** Free. This can't be switched from free to paid later. Car rentals are paid
     _inside_ the app through Stripe, which doesn't make the app "paid".
3. Tick the declarations: Developer Program Policies, US export laws, and **Play App Signing**
   terms.
4. Click **Create app**. The dashboard now shows a **"Set up your app"** checklist, which Steps
   4–5 walk through.

---

## Step 4 — App content (Policy → App content)

Answer every section. Suggested answers for this app are below.

**Privacy policy:** `https://<your-site-domain>/en/legal/privacy`

**App access:** choose _"All or some functionality in my app is restricted"_ → **Add
instructions**:

- Name: `Customer demo account`
- Username / password: the reviewer account from Step 0.4
- Instructions:
  `Open the app → Account tab → Sign in. Search: pick "London Heathrow Airport", any future dates → Search → choose a class → Reserve & continue. Use Stripe test card 4242 4242 4242 4242 only if the production Stripe account is in test mode; otherwise stop before payment.`

**Ads:** _No, my app does not contain ads._

**Content rating:** start the IARC questionnaire. Enter your email, then choose category **"All
Other App Types"**. Answer **No** to violence, sexuality, language, controlled substances,
gambling and crude humour. Interactive elements:

- Users can interact with each other: **No** (there's no chat or UGC).
- Shares user's location with other users: **No**.
- Allows purchases of digital goods: **No**. (Rentals are physical services paid through Stripe.)

Expected result: **Everyone / PEGI 3**.

**Target audience and content:** age group **18 and over** only (renters must hold a driving
licence). "Could the app unintentionally appeal to children?" → **No**.

**News app:** No. **Government app:** No. **Health app:** No.

**Financial features:** _My app doesn't provide any financial features._ (Paying for a rental
through a payment processor isn't a financial feature.)

**Advertising ID:** _No_. Double-check before submitting: if a library adds
`com.google.android.gms.permission.AD_ID` to the merged manifest, the release is blocked until
you answer **Yes** or remove the permission. Play Console shows the app's permissions under
_App bundle explorer_.

**Data safety:** see Appendix B for a field-by-field draft built from what the code actually
sends. Confirm it against your backend and Stripe setup before submitting.

---

## Step 5 — Store listing (Grow users → Store presence → Main store listing)

Copy the text from **Appendix A** and upload the files from this folder:

| Field                       | Use                                                                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------- |
| App name                    | `Car Rental`                                                                                         |
| Short description           | Appendix A (80 characters max)                                                                       |
| Full description            | Appendix A (4000 characters max)                                                                     |
| App icon                    | `1-app-icon/play-store-icon-512.png`                                                                 |
| Feature graphic             | `2-feature-graphic/feature-graphic-1024x500.png`                                                     |
| Video                       | YouTube link to `4-promo-video/promo-video-1920x1080.mp4` (see below)                                |
| Phone screenshots           | all six in `3-phone-screenshots/`, **in order 01 → 06**; they form one continuous day→night panorama |
| 7" / 10" tablet screenshots | Leave empty (optional). Only add real tablet captures, not stretched phone screens                   |

Then open **Store settings** (same menu):

- **App category:** Travel & Local
- **Tags:** pick up to 5 relevant ones (e.g. _Car rental_, _Travel_, _Transportation_)
- **Contact details:** a support email (required; shown publicly), website, phone (optional)

**Uploading the promo video to YouTube:**

1. Go to YouTube Studio → **Create → Upload videos** → pick `promo-video-1920x1080.mp4`.
2. Title: `Car Rental — Rent the right car in a few taps`. Audience: **No, it's not made for
   kids**.
3. Set **Visibility** to _Public_ or _Unlisted_ (**not Private**), make sure **monetization/ads
   are off**, and upload `youtube-thumbnail-1280x720.png` as the custom thumbnail.
4. Copy the watch URL (`https://www.youtube.com/watch?v=…`) into the Play **Video** field.

The video is silent on purpose, because Play autoplays it muted. If you want music on YouTube, add
a track from YouTube Studio → **Editor → Audio** (YouTube Audio Library, cleared for commercial
use).

---

## Step 6 — Testing tracks

### 6.1 Internal testing (everyone; instant, no review wait)

1. **Test and release → Testing → Internal testing → Testers** → create an email list with your
   own address(es) → _Save_.
2. **Releases → Create new release.** On first use, accept **Play App Signing** (Google keeps the
   app-signing key; yours from EAS is the upload key).
3. Upload the `.aab` from Step 2. Release name: `1.0.0 (1)`. Release notes: Appendix A.
4. **Next → Save → Start rollout to Internal testing.**
5. Copy the **"Join on the web"** link, open it on your phone, accept, and install Car Rental from
   Play. Smoke-test sign-in, search, booking and payment against production.

### 6.2 Closed testing (required for new personal accounts)

Google won't let a new **personal** account publish to production until a closed test has had
**at least 12 testers opted in for 14 consecutive days**.

1. **Testing → Closed testing → Create track** (or use the default _Alpha_).
2. **Testers:** add a Google Group or an email list with **at least 12 real people** (friends,
   family, colleagues, each with a Google account on an Android phone). Aim for 15 or more, since
   anyone who opts out drops the count.
3. Create a release (you can **promote** the internal release), select **countries**, and roll it
   out. The first closed release goes through a short review (usually hours to a couple of days).
4. Share the opt-in link. Every tester must tap **"Become a tester"** _and_ install the app.
5. Keep **12+ testers opted in for 14 days in a row**. Ask them to actually use the app; Google
   asks about their feedback in the next step. Shipping a fix to the closed track during this
   window is fine and looks good.

### 6.3 Apply for production access

After 14 days the dashboard shows **"Apply for production"**. Answer the questionnaire honestly:
how you recruited testers, what feedback you got, what you changed, and why the app is ready. A
decision usually takes up to 7 days.

(Organization accounts skip 6.2–6.3.)

---

## Step 7 — Release to production

1. **Test and release → Production → Countries / regions** → _Add countries_ → pick the markets
   where the rental service operates.
2. **Create new release** → _Add from library_ (reuse the tested `.aab`) or upload a new one →
   release notes → **Next**.
3. Fix anything the **Review** screen flags (red = blocking, yellow = warning).
4. **Save → Go to overview → Send changes for review** (under _Publishing overview_).
5. First reviews for new accounts often take **several days, sometimes up to a week or more**.
   You'll get an email. Once approved the app goes live automatically, unless you turned on
   **Managed publishing**, in which case you press _Publish_.

**Staged rollout:** for updates, roll out to 10–20% first and watch **Quality → Android vitals**
(crashes, ANRs) before going to 100%.

---

## After launch

- **Updates:** each build auto-increments `versionCode` (EAS). After the first manual upload you
  can push from the CLI:
  1. Play Console → **Setup → API access** → create a Google Cloud service account and grant it
     _Release manager_ for this app.
  2. Download its JSON key to `apps/mobile/credentials/google-play-service-account.json`
     (gitignored).
  3. Run `eas submit -p android --latest`. `eas.json` sends it to the **internal** track as a
     **draft**; promote it in the Console.
- **Reviews:** reply from **Quality → Ratings and reviews**. Replies are public.
- **Store listing experiments:** A/B test the screenshots or feature graphic under **Grow users →
  Store listing experiments**.
- **Policy emails:** Google emails the account owner about policy changes, usually with a 30+ day
  deadline. Watch that inbox.

## Common rejection reasons (and this app's answer)

| Rejection                                        | Status here                                                            |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| Target API level too low                         | **Fix in Step 0.1**                                                    |
| Photo/video permission without core use          | **Fix in Step 0.2**                                                    |
| Reviewer couldn't sign in                        | Step 0.4 + App access instructions                                     |
| Missing in-app / web account deletion            | In-app ✅ (Data requests & account closure); web URL in Step 0.3       |
| Data safety form doesn't match app behaviour     | Appendix B, based on what the code sends                               |
| Misleading metadata (fake ratings, "#1", "best") | Listing copy avoids these; don't add the placeholder rating (Step 0.5) |
| Screenshots not showing the real app             | All six use unmodified in-app captures                                 |
| Broken privacy-policy link                       | Step 0.3                                                               |

---

## Appendix A — Store listing copy (en-US)

**App name** (10/30)

```
Car Rental
```

**Short description** (80/80)

```
Book a rental car in a few taps: live availability and your trip price up front.
```

**Full description**

```
Rent the right car in a few taps.

Car Rental makes booking a car simple. Choose where you want to pick up, set your dates, and see exactly which cars are available — with the price for your trip shown before you reserve.

WHY YOU'LL LIKE IT
• Live availability — see what's free at your pickup point for your exact dates, class by class.
• Know your trip price up front — the price for your trip is shown before you reserve.
• Pick up where you need it — choose the pickup location that suits your trip.
• A car for every kind of trip — Economy, Compact, Intermediate, SUV and Premium.
• Choose the exact car you'll drive — pick a specific vehicle, or take any available car in the class.
• Every spec at a glance — seats, luggage, doors, transmission and features such as air conditioning, Apple CarPlay / Android Auto, cruise control and parking sensors.
• Easy changes — view your trips, extend a rental or cancel a reservation from your phone, and keep your invoices and receipts in one place.
• Secure checkout — pay by card, processed securely by Stripe.
• Quick, secure access — unlock the app with your fingerprint or face.
• Light and dark mode — easy on the eyes, day or night.
• English, العربية and Français — the app follows your language, including right-to-left layouts.
• Your data, your choice — ask for a copy of your data, a correction, or account closure right from the app.

HOW IT WORKS
1. Pick a pickup location and your dates.
2. Compare available classes and prices.
3. Choose your car, add your driver details and reserve.

Questions? Open Help in the app or contact our support team.
```

**Release notes for 1.0.0** (≤ 500 characters)

```
Welcome to Car Rental! Search live availability, compare classes from Economy to Premium, see your trip price up front and book in a few taps. Manage your trips, extend or cancel from your phone, and switch between light and dark mode.
```

## Appendix B — Data safety draft

Built from `apps/mobile/src`: what each screen sends to the API and which SDKs run. **Confirm with
your backend before submitting**, because Google checks the form against the app.

**Overview answers**

- Does your app collect or share any of the required user data types? **Yes**
- Is all user data encrypted in transit? **Yes** (HTTPS API)
- Do you provide a way for users to request that their data is deleted? **Yes**: in-app _Data
  requests & account closure_, plus the web URL from Step 0.3.

**Data types**. Every type below is: _Collected_ ✔, _Shared_ ✘ (Stripe and your hosting count
as **service providers**, which Google doesn't treat as sharing), _Processed ephemerally_ ✘,
_Required_ unless noted.

| Category            | Data type                                         | Why (purposes)                                 | Optional?                          |
| ------------------- | ------------------------------------------------- | ---------------------------------------------- | ---------------------------------- |
| Personal info       | Name                                              | Account management, App functionality          | Required                           |
| Personal info       | Email address                                     | Account management, App functionality          | Required                           |
| Personal info       | Phone number                                      | App functionality (booking contact)            | Optional, if your form allows      |
| Personal info       | Other info (driver licence number, date of birth) | App functionality (driver eligibility)         | Required to book                   |
| Financial info      | Payment info (entered in Stripe's SDK)            | App functionality (payments), Fraud prevention | Required to pay                    |
| Financial info      | Purchase history (bookings, invoices)             | App functionality, Account management          | Required                           |
| Device or other IDs | Device or other IDs (push notification token)     | App functionality (trip notifications)         | Optional (notification permission) |

**Not collected**, so leave these off:

- **Location.** The app asks for location only to sort pickup points by distance, and does that
  **on the device** (`location-picker-sheet.tsx`). Coordinates are never sent to the server.
- **Photos and videos.** Nothing is uploaded yet (see Step 0.2).
- **App activity / analytics / crash logs.** There's no analytics or crash SDK in the app.

If you later add analytics, crash reporting or licence-photo upload, update this form **before**
shipping that version.

## Appendix C — Asset specifications (checked)

| Asset             | File(s)                              | Size                    | Format              | Google's limit                                   |
| ----------------- | ------------------------------------ | ----------------------- | ------------------- | ------------------------------------------------ |
| App icon          | `play-store-icon-512.png`            | 512×512                 | PNG, 32-bit         | 512×512, ≤ 1 MB                                  |
| Feature graphic   | `feature-graphic-1024x500.png`       | 1024×500                | PNG, RGB (no alpha) | 1024×500, no alpha                               |
| Phone screenshots | `01…06-*.png`                        | 1440×2560               | PNG, RGB (no alpha) | 2–8; 320–3840 px; ≤ 2:1; ≥ 1080 px for promotion |
| Promo video       | `promo-video-1920x1080.mp4`          | 1920×1080, 60 fps, 32 s | H.264 + silent AAC  | YouTube link; landscape recommended              |
| Vertical video    | `promo-video-vertical-1080x1920.mp4` | 1080×1920, 60 fps, 32 s | H.264 + silent AAC  | (social / Shorts)                                |
| YouTube thumbnail | `youtube-thumbnail-1280x720.png`     | 1280×720                | PNG                 | 1280×720, ≤ 2 MB                                 |

Only the icon, feature graphic and at least 2 phone screenshots are **mandatory**. Screenshots at
≥ 1080 px (these are 1440×2560) also make the listing eligible for Play's promotional placements.
