package com.aash.halalah;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The three home-screen widgets (wide 4x2, square 2x2, small 2x1).
 * The web app hands over about a month of prayer times for the place in use (HalalahApp.widget):
 *   { place, days:[ { d:"2026-11-23", off:480, k:"o"|"e"|"c", s:["05:27",...six], t:[epoch ms,...six] } ] }
 * d is the calendar day at the place, off its minutes east of UTC, k the source (official / estimated / calculated).
 * Kept in the app's private settings, so the widgets work with the app closed and the phone offline. They are redrawn
 * at each prayer time and at midnight (one alarm), after a restart, and every half hour as a fallback.
 */
final class Widgets {
    static final String ACTION = "com.aash.halalah.WIDGET";
    private static final String PREFS = "widget", DATA = "data";
    private static final String[] NAMES = { "Subuh", "Syuruk", "Zohor", "Asar", "Maghrib", "Isyak" };
    private static final int[] L = { R.id.l0, R.id.l1, R.id.l2, R.id.l3, R.id.l4, R.id.l5 };
    private static final int[] T = { R.id.t0, R.id.t1, R.id.t2, R.id.t3, R.id.t4, R.id.t5 };
    private static final int[] C = { R.id.c0, R.id.c1, R.id.c2, R.id.c3, R.id.c4, R.id.c5 };
    private static final int INK = 0xFFF6F3E9, SOFT = 0xFFDDE2CC, DARK = 0xFF10140B;
    private static final long DAY = 24 * 60 * 60 * 1000L;

    private Widgets() {}

    static void save(Context c, String json) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(DATA, json == null ? "" : json).apply();
        refresh(c);
    }

    /** What the widgets show right now, worked out from the saved month. */
    private static final class Model {
        String place = "Halalah", src = "", next = "Open Halalah to load prayer times";
        String[] times = null;          // six "HH:MM" for the day at the place, or null when there is nothing to show
        int hi = -1;                    // which of the six is next (today only)
        long wake = 0;                  // when the picture next changes
    }

    private static Model model(Context c) {
        Model m = new Model();
        long now = System.currentTimeMillis();
        try {
            JSONObject o = new JSONObject(c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(DATA, ""));
            m.place = o.optString("place", "Halalah");
            JSONArray days = o.getJSONArray("days");
            int today = -1; long nextAt = 0; int nextDay = -1, nextIdx = -1;
            for (int i = 0; i < days.length(); i++) {
                JSONObject d = days.getJSONObject(i);
                long start = dayStart(d.getString("d"), d.optInt("off", 480));
                if (start <= now && now < start + DAY) { today = i; m.wake = start + DAY; }
                JSONArray t = d.getJSONArray("t");
                for (int j = 0; j < 6 && nextDay < 0; j++) {
                    if (j == 1 || t.isNull(j)) continue;                     // Syuruk is not a prayer
                    if (t.getLong(j) > now) { nextDay = i; nextIdx = j; nextAt = t.getLong(j); }
                }
            }
            if (today < 0) return m;                                           // the saved month has run out
            JSONObject d = days.getJSONObject(today);
            JSONArray s = d.getJSONArray("s");
            m.times = new String[6];
            for (int j = 0; j < 6; j++) m.times[j] = s.isNull(j) ? "—" : s.getString(j);
            String k = d.optString("k", "o");
            m.src = "o".equals(k) ? "MUIS" : "c".equals(k) ? "Calculated" : "Estimated";
            if (nextDay >= 0) {
                String at = days.getJSONObject(nextDay).getJSONArray("s").getString(nextIdx);
                m.next = "Next: " + NAMES[nextIdx] + " " + at + (nextDay == today ? "" : " tomorrow");
                if (nextDay == today) m.hi = nextIdx;
                if (m.wake == 0 || nextAt < m.wake) m.wake = nextAt;
            } else m.next = "Open Halalah to load more days";
        } catch (Exception e) { /* nothing saved yet, or unreadable: the widgets say to open the app */ }
        return m;
    }

    /** The instant a calendar day ("2026-11-23") starts at a place off minutes east of UTC. */
    private static long dayStart(String ymd, int off) {
        String[] p = ymd.split("-");
        java.util.Calendar cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"));
        cal.clear();
        cal.set(Integer.parseInt(p[0]), Integer.parseInt(p[1]) - 1, Integer.parseInt(p[2]), 0, 0, 0);
        return cal.getTimeInMillis() - off * 60000L;
    }

    static void refresh(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        if (mgr == null) return;
        Model m = model(c);
        boolean any = false;
        any |= draw(c, mgr, WidgetWide.class, R.layout.widget_wide, m, true, true);
        any |= draw(c, mgr, WidgetSquare.class, R.layout.widget_square, m, true, false);
        any |= draw(c, mgr, WidgetSmall.class, R.layout.widget_small, m, false, true);
        arm(c, any ? m.wake : 0);
    }

    private static boolean draw(Context c, AppWidgetManager mgr, Class<?> cls, int layout, Model m, boolean six, boolean nextLine) {
        int[] ids = mgr.getAppWidgetIds(new ComponentName(c, cls));
        if (ids == null || ids.length == 0) return false;
        RemoteViews rv = new RemoteViews(c.getPackageName(), layout);
        rv.setTextViewText(R.id.place, m.place);
        rv.setTextViewText(R.id.src, m.src);
        if (nextLine) rv.setTextViewText(R.id.next, m.next);
        if (six) {
            for (int j = 0; j < 6; j++) {
                boolean on = j == m.hi;
                rv.setTextViewText(L[j], m.times == null ? (j == 0 ? "Open Halalah" : "") : NAMES[j]);
                rv.setTextViewText(T[j], m.times == null ? "" : m.times[j]);
                rv.setInt(C[j], "setBackgroundResource", on ? R.drawable.widget_hi : 0);
                rv.setTextColor(L[j], on ? DARK : (layout == R.layout.widget_wide ? SOFT : INK));
                rv.setTextColor(T[j], on ? DARK : INK);
            }
        }
        rv.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(c, 3,
                new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        mgr.updateAppWidget(ids, rv);
        return true;
    }

    /** One alarm for the moment the picture next changes (a prayer time or midnight); none when no widget is placed. */
    private static void arm(Context c, long at) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = PendingIntent.getBroadcast(c, 4, new Intent(c, AlarmReceiver.class).setAction(ACTION),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        if (at <= 0) { am.cancel(pi); return; }
        at += 2000;
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC, at, pi);
            else am.setExactAndAllowWhileIdle(AlarmManager.RTC, at, pi);
        } catch (SecurityException e) { am.setAndAllowWhileIdle(AlarmManager.RTC, at, pi); }
    }
}
