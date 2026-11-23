package com.aash.halalah;

import android.Manifest;
import android.app.Activity;
import android.app.NotificationManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.os.SystemClock;
import android.view.View;
import android.view.Window;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Halalah: the one-file web app in a full-screen WebView, served from https://appassets.androidplatform.net/ so
 * localStorage, location and the compass work.
 *
 * Self-updating: the APK carries a copy of the app (assets/www/index.html, build number in build.txt). At each start it
 * asks the repo's latest GitHub release for version.txt; when that number is higher it downloads halalah.html, keeps it
 * in the app's private files and shows it. So web changes reach the phone with no reinstall; the APK itself only needs
 * reinstalling when this Android part changes.
 *
 * /muis is answered here by asking data.gov.sg directly (the MUIS prayer timetable), which avoids the browser's
 * cross-site limits.
 */
public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String HOME = "https://" + HOST + "/";
    private static final String MUIS = "https://data.gov.sg/api/action/datastore_search";
    private static final int REQ_LOCATION = 1, REQ_NOTIFY = 2;
    private WebView web;
    private long startedAt;
    private String geoOrigin;
    private GeolocationPermissions.Callback geoCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        int bg = Color.parseColor("#080A05");
        getWindow().setStatusBarColor(bg);
        getWindow().setNavigationBarColor(bg);
        web = new WebView(this);
        web.setBackgroundColor(bg);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setGeolocationEnabled(true);
        s.setAllowFileAccess(false);
        s.setTextZoom(100);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "HalalahApp");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (!HOST.equals(u.getHost())) return null;
                String path = u.getPath();
                try {
                    if ("/muis".equals(path)) {
                        byte[] body = get(MUIS + "?" + u.getEncodedQuery(), 20000);
                        return new WebResourceResponse("application/json", "utf-8", new ByteArrayInputStream(body));
                    }
                    if (path == null || path.equals("/") || path.equals("/index.html"))
                        return new WebResourceResponse("text/html", "utf-8", Updater.page(MainActivity.this));
                } catch (Exception e) {
                    return new WebResourceResponse("text/plain", "utf-8", 502, "Unavailable", null,
                            new ByteArrayInputStream(String.valueOf(e.getMessage()).getBytes(StandardCharsets.UTF_8)));
                }
                return new WebResourceResponse("text/plain", "utf-8", 404, "Not found", null, new ByteArrayInputStream(new byte[0]));
            }
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (HOST.equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception e) { /* no app for this link */ }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    cb.invoke(origin, true, false);
                } else {
                    geoOrigin = origin; geoCallback = cb;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
                }
            }
        });
        setContentView(web);
        startedAt = SystemClock.elapsedRealtime();
        web.loadUrl(getIntent() != null && getIntent().getBooleanExtra("whatsnew", false) ? HOME + "?whatsnew=1" : HOME);
        new Thread(this::checkForUpdate).start();
        Updater.scheduleBackgroundChecks(this);
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code == REQ_NOTIFY) {
            web.evaluateJavascript("window.__hlNotify&&window.__hlNotify('" + notifyState() + "')", null);
            return;
        }
        if (code != REQ_LOCATION || geoCallback == null) return;
        boolean ok = false;
        for (int r : results) if (r == PackageManager.PERMISSION_GRANTED) ok = true;
        geoCallback.invoke(geoOrigin, ok, false);
        geoCallback = null;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getBooleanExtra("whatsnew", false)) web.loadUrl(HOME + "?whatsnew=1");
    }

    @Override
    public void onBackPressed() { moveTaskToBack(true); }

    /* ---- self-update while the app is open (the background check lives in UpdateJob) ---- */
    private void checkForUpdate() {
        final int build = Updater.check(this);
        if (build <= 0) return;
        final boolean justOpened = SystemClock.elapsedRealtime() - startedAt < 15000;
        runOnUiThread(() -> {
            if (justOpened) { web.loadUrl(HOME + "?whatsnew=1"); Toast.makeText(this, "Halalah updated.", Toast.LENGTH_SHORT).show(); }
            else Toast.makeText(this, "Halalah update ready. It shows the next time you open the app.", Toast.LENGTH_LONG).show();
        });
    }

    private static byte[] get(String url, int timeoutMs) throws Exception { return Updater.get(url, timeoutMs); }

    /** "granted" when notifications can be shown, otherwise "denied". */
    private String notifyState() {
        boolean ok;
        if (Build.VERSION.SDK_INT >= 33) ok = checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        else { NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE); ok = nm == null || nm.areNotificationsEnabled(); }
        return ok ? "granted" : "denied";
    }

    private class Bridge {
        @JavascriptInterface public String build() { return String.valueOf(Updater.currentBuild(MainActivity.this)); }
        @JavascriptInterface public void schedule(String json) { Reminders.save(MainActivity.this, json); }
        @JavascriptInterface public String notifyState() { return MainActivity.this.notifyState(); }
        @JavascriptInterface public boolean exactOk() { return Reminders.exactOk(MainActivity.this); }
        @JavascriptInterface public void askNotify() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && "denied".equals(MainActivity.this.notifyState()))
                    requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIFY);
                else web.evaluateJavascript("window.__hlNotify&&window.__hlNotify('" + MainActivity.this.notifyState() + "')", null);
            });
        }
        @JavascriptInterface public void test(String style) {
            Reminders.show(MainActivity.this, 99, "Test reminder", "This is how Halalah will remind you.", style);
        }
        @JavascriptInterface public void openNotifySettings() {
            runOnUiThread(() -> {
                try {
                    Intent i = Build.VERSION.SDK_INT >= 26
                            ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName())
                            : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName()));
                    startActivity(i);
                } catch (Exception e) { /* no settings screen on this phone */ }
            });
        }
    }
}
