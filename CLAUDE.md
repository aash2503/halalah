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
- **Food redesign (23 Nov 2026, he said the first reskin looked bad):** `src/styles/food.css`, loaded last. Search bar + filter pills + a
  small count on top; locate button and zoom/key stack on the right; ONE dock of the five tools along the bottom; no title plate. Sheets and
  tools use plain rows and dividers, not boxes in boxes. `app.css` was de-chunked (1px lines, no hard shadows, one radius). App icon:
  the sun's path over the pixel skyline on olive (generated with PIL; `src/assets/icon-*.png`, Android mipmap).
- **Food as a utility (23 Nov 2026, his call: drop the gamified look):** `src/ui/list.js`. Food opens on a nearest-first LIST with a List | Map
  switch; no first screen, no dock. Category pills combine, plus a distance row and Saved; the same selection drives list, map and
  "Pick for me" (the highlight runs down the rows on screen and stops on one: replaces the spin wheel). Place page: Get directions,
  Walk me there (`openFinderTo`), Save, Share. Quests, ranks, badges, visited, the log, the card and proximity pop-ups are hidden, not
  deleted (their modules still load; saved progress is untouched). List = olive and cream; colour lives on the MAP: Esri World Street Map
  tiles and pins coloured by type (`SUB_SCHEME` colours in config.js, same dot in the list).
- **Travel mode (23 Nov 2026):** `src/solat/place.js` (Singapore | Where I am | A city; method, Asar rule, buffer) and `src/solat/calc.js`
  (methods table, `calcTimes`, `roundTimes`). Singapore stays the only OFFICIAL source. Elsewhere times are CALCULATED and say so: banner
  "Calculated" + method, tap the banner for the explanation, a +N mark beside any time moved by the buffer, "(calculated)" in reminders,
  and More > Place lists everything adjusting the numbers (`adjustments()`). Rule from him: every adjustment must be visible to the user.
  JAKIM = 18 deg / 18 deg (Malaysia moved Subuh from 20 to 18 in 2020), no extra padding: checked against the official Sabah Mufti (Zon 8,
  2024) and Labuan (2026) tables: 78 times, 61 exact, 17 one minute off, none worse. Dates and "now" use the place's clock (`placeNow`).
- **Update pings (23 Nov 2026):** `Updater.java` + `UpdateJob.java` check the release about every six hours in the background and notify
  "Halalah updated" with `notes.txt` (= `NEWS[0].title` in `src/whatsnew.js`); the tap opens More > What's new (`?whatsnew=1`).
  ADD AN ENTRY AT THE TOP OF `src/whatsnew.js` WITH EVERY PUSH.
- **Widgets (23 Nov 2026, redesigned after a UI/UX pass he approved from mockups):** five, all drawn by `Widgets.java` from a month of
  times the web app hands over (`HalalahApp.widget`, built by `buildWidget` in remind.js). 4x2 and 3x2: place + source, the sun's path
  over the skyline (a bitmap drawn in `sunPath`, same maths as `arcSvg`), "Next · Asar" and a large time on the left; six rows on the
  right. 2x2: six rows. 4x1: six times in a line. 2x1: next prayer. Type is Outfit (`res/font/`, bundled; the pixel font was dropped from
  widgets because it overflowed at hero size). Source = mark + word (green dot MUIS, ring Calculated, red ! Estimated). No text under
  12sp. Widget names stay short (some launchers print them). One alarm redraws at each prayer time and at midnight; Android's half-hourly
  update moves the sun. Layouts live in the APK: any layout change needs a new APK. Singapore is also the first entry in the city list
  and always means the official MUIS table.
- **Tabs** (`src/ui/tabs.js`): Solat (opens first), Kiblat, Food (the original map, `#app`), More. Shared food links open on Food.
- **Prayer times** (`src/solat/data.js`): MUIS timetable from data.gov.sg (dataset `d_a6a206cba471fe04b62dd886ef5eaf22`), fetched in
  the browser and cached (`hl.solat.v1`). No official row for a date = calculated times, always labelled "Estimated". Never show an
  estimate as official. Hijri (`hijri.js`): Umm al-Qura with a -1/0/+1 adjustment; MUIS's own calendar is still to do.
- **Still to do:** bundle the MUIS year table in the build;
  month view; official JAKIM zone times for Malaysia (e-solat) in place of calculation;
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
