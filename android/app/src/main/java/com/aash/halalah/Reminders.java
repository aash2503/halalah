package com.aash.halalah;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Prayer reminders that work with the app closed and the phone offline.
 * The web app hands over a list of upcoming reminders (about a month: time, title, text, alert style); it is kept in
 * the app's private settings. One alarm is set for the next entry; when it fires the notification is shown and the
 * alarm moves to the entry after. The list is re-armed after a restart or an app update.
 */
final class Reminders {
    static final String ACTION = "com.aash.halalah.REMINDER";
    private static final String PREFS = "reminders", LIST = "list", DONE = "doneUpTo";
    private static final long LATE_LIMIT = 20 * 60 * 1000L;   // a reminder more than 20 minutes late is dropped, not shown

    private Reminders() {}

    static void save(Context c, String json) {
        prefs(c).edit().putString(LIST, json == null ? "[]" : json).putLong(DONE, System.currentTimeMillis()).apply();
        arm(c);
    }

    /** Sets the one alarm for the next entry still to come (or clears it when there is none). */
    static void arm(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        PendingIntent pi = PendingIntent.getBroadcast(c, 0, new Intent(c, AlarmReceiver.class).setAction(ACTION),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        long done = Math.max(prefs(c).getLong(DONE, 0), System.currentTimeMillis() - LATE_LIMIT), next = Long.MAX_VALUE;
        try {
            JSONArray a = new JSONArray(prefs(c).getString(LIST, "[]"));
            for (int i = 0; i < a.length(); i++) {
                long t = a.getJSONObject(i).optLong("t", 0);
                if (t > done && t < next) next = t;
            }
        } catch (Exception e) { /* an unreadable list means no reminders */ }
        if (next == Long.MAX_VALUE) { am.cancel(pi); return; }
        try {
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
            else am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
        } catch (SecurityException e) {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
        }
    }

    /** The alarm went off: show every entry that has come due, then set the alarm for the next one. */
    static void fire(Context c) {
        long now = System.currentTimeMillis(), done = prefs(c).getLong(DONE, 0);
        try {
            JSONArray a = new JSONArray(prefs(c).getString(LIST, "[]"));
            for (int i = 0; i < a.length(); i++) {
                JSONObject o = a.getJSONObject(i);
                long t = o.optLong("t", 0);
                if (t > done && t <= now + 5000 && now - t < LATE_LIMIT)
                    show(c, o.optInt("id", 0), o.optString("title", "Halalah"), o.optString("text", ""), o.optString("ch", "sound"));
            }
        } catch (Exception e) { /* nothing to show */ }
        prefs(c).edit().putLong(DONE, now + 5000).apply();
        arm(c);
    }

    static boolean exactOk(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return am != null && (Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms());
    }

    static void show(Context c, int id, String title, String text, String style) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        String ch = "vibrate".equals(style) ? "prayer_vibrate" : "silent".equals(style) ? "prayer_silent" : "prayer_sound";
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            channels(nm);
            b = new Notification.Builder(c, ch);
        } else {
            b = new Notification.Builder(c);
            if ("prayer_sound".equals(ch)) b.setDefaults(Notification.DEFAULT_SOUND | Notification.DEFAULT_VIBRATE).setPriority(Notification.PRIORITY_HIGH);
            else if ("prayer_vibrate".equals(ch)) b.setDefaults(Notification.DEFAULT_VIBRATE).setPriority(Notification.PRIORITY_HIGH);
        }
        PendingIntent open = PendingIntent.getActivity(c, 1, new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        b.setSmallIcon(R.drawable.ic_stat).setContentTitle(title).setContentText(text).setAutoCancel(true)
                .setShowWhen(true).setWhen(System.currentTimeMillis()).setContentIntent(open).setCategory(Notification.CATEGORY_REMINDER);
        try { nm.notify(100 + id, b.build()); } catch (SecurityException e) { /* notifications not allowed */ }
    }

    private static void channels(NotificationManager nm) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel s = new NotificationChannel("prayer_sound", "Prayer reminders (sound and vibrate)", NotificationManager.IMPORTANCE_HIGH);
        s.enableVibration(true);
        NotificationChannel v = new NotificationChannel("prayer_vibrate", "Prayer reminders (vibrate only)", NotificationManager.IMPORTANCE_HIGH);
        v.setSound(null, null); v.enableVibration(true); v.setVibrationPattern(new long[]{0, 400, 200, 400});
        NotificationChannel q = new NotificationChannel("prayer_silent", "Prayer reminders (silent)", NotificationManager.IMPORTANCE_LOW);
        nm.createNotificationChannel(s); nm.createNotificationChannel(v); nm.createNotificationChannel(q);
    }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
