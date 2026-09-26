# Google Play launch kit — Car Rental (`com.carrental.app`)

Everything needed to publish the Android app on Google Play, in one folder.

**Start here → [`PUBLISHING-GUIDE.md`](./PUBLISHING-GUIDE.md)**. It walks from creating a new Play
developer account to a production release, and holds the listing text, Data safety answers and
the pre-flight fixes this app needs.

```
google-play/
├── PUBLISHING-GUIDE.md              step-by-step guide + store listing copy + Data safety draft
├── 1-app-icon/
│   └── play-store-icon-512.png      512×512 — from the app's own launcher icon (assets/icon.png)
├── 2-feature-graphic/
│   └── feature-graphic-1024x500.png 1024×500, no alpha
├── 3-phone-screenshots/             upload in this order — one continuous day → night panorama
│   ├── 01-rent-the-right-car.png          light · home
│   ├── 02-live-availability.png           light · available vehicles
│   ├── 03-trip-price-up-front.png         light · vehicle detail
│   ├── 04-light-and-dark-mode.png         light ↔ dark split
│   ├── 05-pickup-where-you-need-it.png    dark · home
│   └── 06-choose-your-exact-car.png       dark · vehicle detail
├── 4-promo-video/
│   ├── promo-video-1920x1080.mp4          32 s, 60 fps — upload to YouTube, link it in Play
│   ├── promo-video-vertical-1080x1920.mp4 same story, portrait (Shorts / social)
│   └── youtube-thumbnail-1280x720.png     custom YouTube thumbnail
├── 5-app-captures/                  the 6 original device captures, untouched (not for upload)
└── source/                          HTML designs + render.mjs that regenerate 1–4
```

Every screen shown in the designs is a real, unmodified capture from `5-app-captures/`. The
only change is repainting the emulator's black navigation strip with a native gesture bar.

## Updating the assets

When the UI changes, replace the matching file in `5-app-captures/` (same name, taken on a
1344×2992 emulator) and re-render. See [`source/README.md`](./source/README.md).
