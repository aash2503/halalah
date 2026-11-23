package com.aash.halalah;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.DashPathEffect;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.Build;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The five home-screen widgets: 4x2 and 3x2 (place, the sun's path, the next prayer, six times as rows), 2x2 (six rows),
 * 4x1 (six times in a line) and 2x1 (the next prayer). Olive gradient, Outfit type, off-white for what is next.
 *
 * The web app hands over about a month of prayer times for the place in use (HalalahApp.widget):
 *   { place, days:[ { d:"2026-11-23", off:480, k:"o"|"e"|"c", s:["05:27",...six], t:[epoch ms,...six] } ] }
 * d is the calendar day at the place, off its minutes east of UTC, k the source (official / estimated / calculated).
 * Kept in the app's private settings, so the widgets work with the app closed and the phone offline. They are redrawn
 * at each prayer time and at midnight (one alarm), after a restart, and every half hour by Android (which is what moves
 * the sun along its path).
 */
final class Widgets {
    static final String ACTION = "com.aash.halalah.WIDGET";
    private static final String PREFS = "widget", DATA = "data";
    private static final String[] NAMES = { "Subuh", "Syuruk", "Zohor", "Asar", "Maghrib", "Isyak" };
    private static final int[] L = { R.id.l0, R.id.l1, R.id.l2, R.id.l3, R.id.l4, R.id.l5 };
    private static final int[] T = { R.id.t0, R.id.t1, R.id.t2, R.id.t3, R.id.t4, R.id.t5 };
    private static final int[] C = { R.id.c0, R.id.c1, R.id.c2, R.id.c3, R.id.c4, R.id.c5 };
    private static final int INK = 0xFFF6F3E9, SOFT = 0xFFDDE2CC, DARK = 0xFF10140B, GREEN = 0xFF34D399, RED = 0xFFEF4444;
    private static final int[] SKY = { 1,1,1,7,7,1,1,2,3,4,4,3,2,1,1,1,1,1,2,2,2,3,3,4,5,6,7,8,8,9,9,10,10,11 };
    private static final long DAY = 24 * 60 * 60 * 1000L;

    private Widgets() {}

    static void save(Context c, String json) {
        c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(DATA, json == null ? "" : json).apply();
        refresh(c);
    }

    /** What the widgets show right now, worked out from the saved month. */
    private static final class Model {
        String place = "Halalah", kind = "";
        String nextLabel = "Open Halalah", nextTime = "";       // "Next · Asar" / "Tomorrow · Subuh", and its time
        String[] times = null;          // six "HH:MM" for today at the place, or null when there is nothing to show
        long[] at = null;               // the same six as instants (0 where there is none), for the sun's path
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
            JSONArray s = d.getJSONArray("s"), t = d.getJSONArray("t");
            m.times = new String[6]; m.at = new long[6];
            for (int j = 0; j < 6; j++) { m.times[j] = s.isNull(j) ? "—" : s.getString(j); m.at[j] = t.isNull(j) ? 0 : t.getLong(j); }
            m.kind = d.optString("k", "o");
            if (nextDay >= 0) {
                m.nextLabel = (nextDay == today ? "Next · " : "Tomorrow · ") + NAMES[nextIdx];
                m.nextTime = days.getJSONObject(nextDay).getJSONArray("s").getString(nextIdx);
                if (nextDay == today) m.hi = nextIdx;
                if (m.wake == 0 || nextAt < m.wake) m.wake = nextAt;
            } else m.nextLabel = "Open Halalah for more days";
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

    /** The source in a mark and a word, as in the app: green dot MUIS, ring Calculated, red ! Estimated. */
    private static CharSequence source(String kind) {
        if (kind.isEmpty()) return "";
        boolean official = "o".equals(kind), calc = "c".equals(kind);
        SpannableString s = new SpannableString(official ? "● MUIS" : calc ? "○ Calculated" : "! Estimated");
        s.setSpan(new ForegroundColorSpan(official ? GREEN : calc ? INK : RED), 0, 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return s;
    }

    static void refresh(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        if (mgr == null) return;
        Model m = model(c);
        boolean any = false;
        any |= draw(c, mgr, WidgetWide.class, R.layout.widget_wide, m, true, true, true);
        any |= draw(c, mgr, WidgetMedium.class, R.layout.widget_medium, m, true, true, true);
        any |= draw(c, mgr, WidgetSquare.class, R.layout.widget_square, m, true, false, false);
        any |= draw(c, mgr, WidgetBar.class, R.layout.widget_bar, m, true, false, false);
        any |= draw(c, mgr, WidgetSmall.class, R.layout.widget_small, m, false, true, false);
        arm(c, any ? m.wake : 0);
    }

    private static boolean draw(Context c, AppWidgetManager mgr, Class<?> cls, int layout, Model m, boolean six, boolean next, boolean arc) {
        int[] ids = mgr.getAppWidgetIds(new ComponentName(c, cls));
        if (ids == null || ids.length == 0) return false;
        RemoteViews rv = new RemoteViews(c.getPackageName(), layout);
        rv.setTextViewText(R.id.place, m.place);
        rv.setTextViewText(R.id.src, source(m.kind));
        if (next) { rv.setTextViewText(R.id.nl, m.nextLabel); rv.setTextViewText(R.id.ntime, m.nextTime); }
        if (arc) {
            Bitmap b = sunPath(m);
            rv.setViewVisibility(R.id.arc, b == null ? View.INVISIBLE : View.VISIBLE);
            if (b != null) rv.setImageViewBitmap(R.id.arc, b);
        }
        if (six) {
            boolean cells = layout == R.layout.widget_bar;                    // labels there are dimmer than the times
            for (int j = 0; j < 6; j++) {
                boolean on = j == m.hi;
                rv.setTextViewText(L[j], m.times == null ? (j == 0 ? "Open Halalah" : "") : NAMES[j]);
                rv.setTextViewText(T[j], m.times == null ? "" : m.times[j]);
                rv.setInt(C[j], "setBackgroundResource", on ? R.drawable.widget_hi : 0);
                rv.setTextColor(L[j], on ? DARK : cells ? SOFT : INK);
                rv.setTextColor(T[j], on ? DARK : INK);
            }
        }
        rv.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(c, 3,
                new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        mgr.updateAppWidget(ids, rv);
        return true;
    }

    /**
     * The app's banner picture, as a bitmap: the sun's path over the pixel skyline. Time runs left to right from before
     * Subuh to after Isyak; the curve is above the horizon between Syuruk and Maghrib; marks sit at the prayer times;
     * the solid part and the dot are the sun so far today. Null when a time is missing (far north in summer).
     */
    private static Bitmap sunPath(Model m) {
        if (m.at == null) return null;
        for (long v : m.at) if (v == 0) return null;
        final float S = 2f, W = 340, H = 76, HZ = 62, A = 50;
        final double t0 = m.at[0] - 45 * 60000.0, t1 = m.at[5] + 45 * 60000.0, rise = m.at[1], set = m.at[4];
        double now = Math.min(Math.max(System.currentTimeMillis(), t0), t1);
        Bitmap bmp = Bitmap.createBitmap((int) (W * S), (int) (H * S), Bitmap.Config.ARGB_8888);
        Canvas cv = new Canvas(bmp);
        cv.scale(S, S);
        Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);

        p.setStyle(Paint.Style.STROKE); p.setStrokeCap(Paint.Cap.ROUND);
        p.setColor(0x73F6F3E9); p.setStrokeWidth(3); p.setPathEffect(new DashPathEffect(new float[]{ 3, 8 }, 0));
        cv.drawPath(curve(t0, t1, t0, t1, rise, set, W, HZ, A), p);
        p.setPathEffect(null); p.setColor(INK); p.setStrokeWidth(4);
        if (now > t0) cv.drawPath(curve(t0, now, t0, t1, rise, set, W, HZ, A), p);

        p.setStyle(Paint.Style.FILL); p.setAntiAlias(false); p.setColor(0x8C080A05);
        for (int i = 0; i < 68; i++) { int h = SKY[i < 34 ? i : 67 - i]; cv.drawRect(i * 5f, HZ - h * 3f, i * 5f + 5.2f, H, p); }
        p.setAntiAlias(true); p.setColor(0xCCF6F3E9);
        for (int j = 0; j < 6; j++) if (j != 1) cv.drawCircle(x(m.at[j], t0, t1, W), y(m.at[j], rise, set, HZ, A), 4, p);
        float sx = x(now, t0, t1, W), sy = y(now, rise, set, HZ, A);
        p.setColor(0x33F6F3E9); cv.drawCircle(sx, sy, 18, p);
        p.setColor(INK); cv.drawCircle(sx, sy, 10, p);
        return bmp;
    }
    private static float x(double t, double t0, double t1, float w) { return (float) (6 + (w - 12) * (t - t0) / (t1 - t0)); }
    private static float y(double t, double rise, double set, float hz, float a) {
        double s = Math.sin(Math.PI * (t - rise) / (set - rise));
        return (float) (hz - (s >= 0 ? a * s : 9 * Math.max(s, -1)));
    }
    private static Path curve(double from, double to, double t0, double t1, double rise, double set, float w, float hz, float a) {
        Path path = new Path();
        for (int i = 0; i <= 40; i++) {
            double t = from + (to - from) * i / 40;
            if (i == 0) path.moveTo(x(t, t0, t1, w), y(t, rise, set, hz, a)); else path.lineTo(x(t, t0, t1, w), y(t, rise, set, hz, a));
        }
        return path;
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
