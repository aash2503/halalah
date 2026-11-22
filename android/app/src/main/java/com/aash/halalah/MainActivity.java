package com.aash.halalah;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
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
    private static final String RELEASE = "https://github.com/aash2503/halalah/releases/latest/download/";
    private static final String MUIS = "https://data.gov.sg/api/action/datastore_search";
    private static final int REQ_LOCATION = 1;
    private WebView web;
    private long startedAt;
    private String geoOrigin;
    private GeolocationPermissions.Callback geoCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        int bg = Color.parseColor("#0A0F18");
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
                        return new WebResourceResponse("text/html", "utf-8", page());
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
        web.loadUrl(HOME);
        new Thread(this::checkForUpdate).start();
    }

    @Override
    public void onRequestPermissionsResult(int code, String[] perms, int[] results) {
        if (code != REQ_LOCATION || geoCallback == null) return;
        boolean ok = false;
        for (int r : results) if (r == PackageManager.PERMISSION_GRANTED) ok = true;
        geoCallback.invoke(geoOrigin, ok, false);
        geoCallback = null;
    }

    @Override
    public void onBackPressed() { moveTaskToBack(true); }

    /* ---- which copy of the app to show ---- */
    private File savedPage() { return new File(getFilesDir(), "halalah.html"); }
    private File savedBuild() { return new File(getFilesDir(), "build.txt"); }

    private int bundledBuild() {
        try (InputStream in = getAssets().open("www/build.txt")) { return number(new String(read(in), StandardCharsets.UTF_8)); }
        catch (Exception e) { return 0; }
    }
    private int downloadedBuild() {
        try (InputStream in = new FileInputStream(savedBuild())) { return savedPage().exists() ? number(new String(read(in), StandardCharsets.UTF_8)) : 0; }
        catch (Exception e) { return 0; }
    }
    private int currentBuild() { return Math.max(bundledBuild(), downloadedBuild()); }

    private InputStream page() throws Exception {
        if (downloadedBuild() > bundledBuild()) return new FileInputStream(savedPage());
        return getAssets().open("www/index.html");
    }

    private void checkForUpdate() {
        try {
            int latest = number(new String(get(RELEASE + "version.txt", 15000), StandardCharsets.UTF_8));
            if (latest <= currentBuild()) return;
            byte[] html = get(RELEASE + "halalah.html", 60000);
            String tail = new String(html, Math.max(0, html.length - 200), Math.min(200, html.length), StandardCharsets.UTF_8);
            if (html.length < 100000 || !tail.contains("</html>")) return;          // a cut-off download is never kept
            File tmp = new File(getFilesDir(), "halalah.html.tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) { out.write(html); }
            if (!tmp.renameTo(savedPage())) return;
            try (FileOutputStream out = new FileOutputStream(savedBuild())) { out.write(String.valueOf(latest).getBytes(StandardCharsets.UTF_8)); }
            final boolean justOpened = SystemClock.elapsedRealtime() - startedAt < 15000;
            runOnUiThread(() -> {
                if (justOpened) { web.reload(); Toast.makeText(this, "Halalah updated.", Toast.LENGTH_SHORT).show(); }
                else Toast.makeText(this, "Halalah update ready. It shows the next time you open the app.", Toast.LENGTH_LONG).show();
            });
        } catch (Exception e) { /* offline or no release yet: keep what we have */ }
    }

    /* ---- small helpers ---- */
    private static int number(String s) { try { return Integer.parseInt(s.trim()); } catch (Exception e) { return 0; } }

    private static byte[] read(InputStream in) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buf = new byte[16384]; int n;
        while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
        return out.toByteArray();
    }

    private static byte[] get(String url, int timeoutMs) throws Exception {
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

    private class Bridge {
        @JavascriptInterface public String build() { return String.valueOf(currentBuild()); }
    }
}
