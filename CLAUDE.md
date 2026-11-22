# Halalah: notes for Claude

Halal food map + prayer times (Solat), kiblat compass. Owner: Mr Aashiq. Used by him and his wife (both Android).

- **Design: option B (picked 22 Nov 2026)**, from his UX golden rules (`pp-office/reference/ux-golden-rules.md`, incl. Visual rules). Dark only.
  Pixel font only for the logo, the next prayer and short labels of 12px+; everything read is 14-16px sentence case.
  Tap targets 44px+. Spacing 4/8/16/24, 16px panel padding, one radius (8px). Yellow = the one primary action, the current tab,
  the next prayer. Red = errors only. Pixel SVG icons (`src/ui/icons.js`), no emoji. No scanlines. Verb + object buttons.
  Tokens and the new views: `src/styles/b.css`. Mockups: https://claude.ai/artifact/CrAeZwCqboQAHKRnWuNqnF
- **Skin (22 Nov 2026, replaces the navy/yellow colours above):** deep olive, black and off-white only; no maroon, no tatreez band.
  Off-white is the one act colour (next-prayer row, current tab, primary button). The Solat banner carries the flair: olive gradient, the
  sun's path over a pixel skyline (`arcSvg` in solat.js), the place, and Live (green dot) / Saved (amber dot) / Estimated (red !) with words.
  No status bar. Solat must fit one screen without scrolling from 360x640 up. Food screens reskinned 22 Nov (first pass: overrides at
  the end of `b.css`, sizes and colours rewritten in `app.css`, UI strings in sentence case; data values such as names, 'ALL', zone
  names stay capitals because code compares them). Left: category chip colours, region-badge emoji, a check on a real phone.
- **Tabs** (`src/ui/tabs.js`): Solat (opens first), Kiblat, Food (the original map, `#app`), More. Shared food links open on Food.
- **Prayer times** (`src/solat/data.js`): MUIS timetable from data.gov.sg (dataset `d_a6a206cba471fe04b62dd886ef5eaf22`), fetched in
  the browser and cached (`hl.solat.v1`). No official row for a date = calculated times, always labelled "Estimated". Never show an
  estimate as official. Hijri (`hijri.js`): Umm al-Qura with a -1/0/+1 adjustment; MUIS's own calendar is still to do.
- **Still to do:** bundle the MUIS year table in the build;
  month view; travel mode (location-based times, calculation method); the home-screen widget;
  iPhone web push (later).
- **Reminders (22 Nov 2026; no azan, his call):** `src/solat/remind.js` builds 30 days of reminders (per-prayer bells, at the time and/or N
  minutes before, sound and vibrate / vibrate only / silent) and hands them to the shell (`HalalahApp.schedule`); `Reminders.java` keeps the
  list and one alarm for the next entry, `AlarmReceiver` shows it and re-arms after a restart. Settings live in More. A change to the
  Java side needs a new APK install; the web side self-updates.
- **Android app** (`android/`, package `com.aash.halalah`; `.github/workflows/apk.yml`): a WebView shell that carries the one-file app and
  self-updates: at each start it reads `version.txt` from the repo's `latest` release and downloads `halalah.html` when the build number is
  higher. Only Android-side changes need a reinstall. `/muis` in the shell proxies data.gov.sg (`window.HalalahApp` marks the app).
  The signing key is never in the repo (public): four `ANDROID_*` Actions secrets, else a cached debug key.
- **Build:** `npm run build` -> ONE file `dist/halalah-vX.Y.html` for canvaslink (verify-build.js fails on any sibling asset or new
  host). Never a service_role key in the repo. Plan first and wait for "go".
