package com.aash.halalah;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Self-update. The APK carries a copy of the web app (assets/www/index.html, build number in build.txt). The repo's
 * latest GitHub release carries version.txt, halalah.html and notes.txt (one line: what changed). check() downloads a
 * newer halalah.html into the app's private files. It runs when the app opens (MainActivity) and a few times a day in
 * the background (UpdateJob), which then shows a "Halalah updated" notification with the note.
 */
final class Updater {
    static final String RELEASE = "https://github.com/aash2503/halalah/releases/latest/download/";
    private static final int JOB_ID = 7;

    private Updater() {}

    static File savedPage(Context c) { return new File(c.getFilesDir(), "halalah.html"); }
    private static File savedBuild(Context c) { return new File(c.getFilesDir(), "build.txt"); }

    static int bundledBuild(Context c) {
        try (InputStream in = c.getAssets().open("www/build.txt")) { return number(new String(read(in), StandardCharsets.UTF_8)); }
        catch (Exception e) { return 0; }
    }
    static int downloadedBuild(Context c) {
        if (!savedPage(c).exists()) return 0;
        try (InputStream in = new FileInputStream(savedBuild(c))) { return number(new String(read(in), StandardCharsets.UTF_8)); }
        catch (Exception e) { return 0; }
    }
    static int currentBuild(Context c) { return Math.max(bundledBuild(c), downloadedBuild(c)); }

    static InputStream page(Context c) throws Exception {
        if (downloadedBuild(c) > bundledBuild(c)) return new FileInputStream(savedPage(c));
        return c.getAssets().open("www/index.html");
    }

    /** Returns the new build number when a newer version was downloaded, otherwise 0. Never throws. */
    static synchronized int check(Context c) {
        try {
            int latest = number(new String(get(RELEASE + "version.txt", 15000), StandardCharsets.UTF_8));
            if (latest <= currentBuild(c)) return 0;
            byte[] html = get(RELEASE + "halalah.html", 60000);
            String tail = new String(html, Math.max(0, html.length - 200), Math.min(200, html.length), StandardCharsets.UTF_8);
            if (html.length < 100000 || !tail.contains("</html>")) return 0;          // a cut-off download is never kept
            File tmp = new File(c.getFilesDir(), "halalah.html.tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(html); }
            if (!tmp.renameTo(savedPage(c))) return 0;
            try (FileOutputStream out = new FileOutputStream(savedBuild(c))) { out.write(String.valueOf(latest).getBytes(StandardCharsets.UTF_8)); }
            return latest;
        } catch (Exception e) { return 0; }                                           // offline, or no release yet
    }

    /** One line saying what changed in the latest release ("" when it cannot be read). */
    static String notes() {
        try {
            String s = new String(get(RELEASE + "notes.txt", 10000), StandardCharsets.UTF_8).trim();
            return s.length() > 180 ? s.substring(0, 180) : s;
        } catch (Exception e) { return ""; }
    }

    static void notifyUpdated(Context c, int build, String notes) {
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel("app_updates", "App updates", NotificationManager.IMPORTANCE_DEFAULT));
            b = new Notification.Builder(c, "app_updates");
        } else b = new Notification.Builder(c).setDefaults(Notification.DEFAULT_SOUND);
        PendingIntent open = PendingIntent.getActivity(c, 2,
                new Intent(c, MainActivity.class).putExtra("whatsnew", true).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        String text = notes == null || notes.isEmpty() ? "Tap to see what's new." : notes;
        b.setSmallIcon(R.drawable.ic_stat).setContentTitle("Halalah updated (build " + build + ")").setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text)).setAutoCancel(true).setContentIntent(open);
        try { nm.notify(50, b.build()); } catch (SecurityException e) { /* notifications not allowed */ }
    }

    /** Asks Android to run UpdateJob about every six hours when there is a connection (kept across restarts). */
    static void scheduleBackgroundChecks(Context c) {
        JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
        if (js == null || js.getPendingJob(JOB_ID) != null) return;
        try {
            js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, UpdateJob.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(6 * 60 * 60 * 1000L).setPersisted(true).build());
        } catch (Exception e) { /* the app still updates when opened */ }
    }

    static int number(String s) { try { return Integer.parseInt(s.trim()); } catch (Exception e) { return 0; } }

    static byte[] read(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384]; int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    static byte[] get(String url, int timeoutMs) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(timeoutMs); c.setReadTimeout(timeoutMs);
        c.setInstanceFollowRedirects(true);
        c.setRequestProperty("User-Agent", "Halalah-Android");
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new Exception("HTTP " + code);
            try (InputStream in = c.getInputStream()) { return read(in); }
        } finally { c.disconnect(); }
    }
}
