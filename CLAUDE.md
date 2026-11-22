# Halalah: notes for Claude

Halal food map + prayer times (Solat), kiblat compass. Owner: Mr Aashiq. Used by him and his wife (both Android).

- **Design: option B (picked 22 Nov 2026)**, from his UX golden rules (`pp-office/reference/ux-golden-rules.md`, incl. Visual rules). Dark only.
  Pixel font only for the logo, the next prayer and short labels of 12px+; everything read is 14-16px sentence case.
  Tap targets 44px+. Spacing 4/8/16/24, 16px panel padding, one radius (8px). Yellow = the one primary action, the current tab,
  the next prayer. Red = errors only. Pixel SVG icons (`src/ui/icons.js`), no emoji. No scanlines. Verb + object buttons.
  Tokens and the new views: `src/styles/b.css`. Mockups: https://claude.ai/artifact/CrAeZwCqboQAHKRnWuNqnF
- **Tabs** (`src/ui/tabs.js`): Solat (opens first), Kiblat, Food (the original map, `#app`), More. Shared food links open on Food.
- **Prayer times** (`src/solat/data.js`): MUIS timetable from data.gov.sg (dataset `d_a6a206cba471fe04b62dd886ef5eaf22`), fetched in
  the browser and cached (`hl.solat.v1`). No official row for a date = calculated times, always labelled "Estimated". Never show an
  estimate as official. Hijri (`hijri.js`): Umm al-Qura with a -1/0/+1 adjustment; MUIS's own calendar is still to do.
- **Still to do:** restyle the Food screens to B (landing, search, sheets, wheel, log); bundle the MUIS year table in the build;
  month view; reminder settings (minutes before, azan or tone); Android wrapper with on-device notifications, then the widget;
  iPhone web push (later).
- **Build:** `npm run build` -> ONE file `dist/halalah-vX.Y.html` for canvaslink (verify-build.js fails on any sibling asset or new
  host). Never a service_role key in the repo. Plan first and wait for "go".
