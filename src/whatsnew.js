/* What's new, newest first. Add an entry at the TOP with every push: `title` is the one line shown in the phone's
   "Halalah updated" notification (the build writes NEWS[0].title to notes.txt), `items` is the list in More. */
export const NEWS = [
  { date:'23 Nov 2026', title:'Widgets now match the app, and there is a new 3 × 2 Solat widget.',
    items:[ 'All widgets: the pixel skyline along the bottom and the pixel font for the next prayer\'s time, as on the Solat screen.', 'New 3 × 2 widget: the next prayer on top, six times in a grid.', 'Shorter widget names. Needs the newest halalah.apk.' ] },
  { date:'23 Nov 2026', title:'The wide widget has a new layout: next prayer on the left, all six times on the right.',
    items:[ 'Wide widget (4 × 2): the next prayer with a large time and the place on the left; all six times as rows on the right. Needs the newest halalah.apk.' ] },
  { date:'23 Nov 2026', title:'Home-screen widgets for prayer times; Singapore in the city list.',
    items:[ 'Three widgets: wide (4 × 2) and square (2 × 2) with all six times, and a small one (2 × 1) with the next prayer. Long-press the home screen, Widgets, Halalah. Needs the newest halalah.apk.',
            'More, Place, A city: Singapore is the first choice and uses the official MUIS timetable, not a calculation.' ] },
  { date:'23 Nov 2026', title:'Food is now a simple nearest-first list; travel mode for prayer times; update pings.',
    items:[
      'Food opens on a list of certified places, nearest first, with a Map switch. Filters combine (for example Hawker and Bakery) and there is a distance limit.',
      '"Pick for me" runs down the places on screen and stops on one.',
      'The map is in colour, with pins coloured by type. Quests, ranks, badges and "visited" are gone; Saved stays.',
      'Travel mode (More, Place): calculated prayer times for where you are or a chosen city, always labelled Calculated with the method named. Optional buffer, shown beside each time.',
      'The app now checks for updates in the background and tells you what changed.',
    ] },
  { date:'23 Nov 2026', title:'Prayer reminders, a new look and a new icon.',
    items:[
      'Reminders for each prayer, at the time or a few minutes before, with sound, vibrate only or silent.',
      'Olive, black and off-white throughout, with the sun\'s path in the Solat banner.',
      'The banner shows the place and whether times are Live, Saved or Estimated.',
    ] },
  { date:'22 Nov 2026', title:'Prayer times and kiblat join Halalah.',
    items:[ 'Solat: all six times for any date, the next prayer and the Hijri date, from the MUIS timetable.', 'Kiblat compass.', 'An Android app that updates itself.' ] },
];
