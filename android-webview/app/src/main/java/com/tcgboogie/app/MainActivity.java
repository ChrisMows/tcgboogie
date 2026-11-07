package com.tcgboogie.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.provider.MediaStore;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.browser.customtabs.CustomTabColorSchemeParams;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import com.google.firebase.FirebaseApp;
import com.google.firebase.messaging.FirebaseMessaging;
import java.io.File;
import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

/** TCG Boogie: the website in a WebView, plus what a WebView can't do by itself (sign-in, push, camera, downloads). */
public class MainActivity extends ComponentActivity {
    static final String EXTRA_URL = "url"; // a page to open, from a notification
    private static final long SPLASH_MAX_MS = 5000;

    private WebView web;
    private View offline;
    private boolean pageShown = false;
    private boolean loadFailed = false;

    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraPhoto;
    private final ActivityResultLauncher<Intent> pickFile = registerForActivityResult(
        new ActivityResultContracts.StartActivityForResult(), result -> {
            ValueCallback<Uri[]> callback = fileCallback;
            fileCallback = null;
            if (callback == null) return;
            callback.onReceiveValue(result.getResultCode() == RESULT_OK ? pickedFiles(result.getData()) : null);
        });

    private int pushWaitingId;
    private JavaScriptReplyProxy pushWaitingReply;
    private final ActivityResultLauncher<String> askNotifications = registerForActivityResult(
        new ActivityResultContracts.RequestPermission(), granted -> {
            JavaScriptReplyProxy reply = pushWaitingReply;
            pushWaitingReply = null;
            if (reply == null) return;
            if (granted) turnPushOn(pushWaitingId, reply);
            else answer(reply, pushWaitingId, "state", shouldShowRequestPermissionRationale(Manifest.permission.POST_NOTIFICATIONS) ? "off" : "blocked");
        });
    private final ActivityResultLauncher<String> askStorage = registerForActivityResult(
        new ActivityResultContracts.RequestPermission(), granted -> { });

    @Override protected void onCreate(Bundle savedInstanceState) {
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        splash.setKeepOnScreenCondition(() -> !pageShown);
        new Handler(Looper.getMainLooper()).postDelayed(() -> pageShown = true, SPLASH_MAX_MS);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.setAppearanceLightStatusBars(false);
        bars.setAppearanceLightNavigationBars(false);
        ViewCompat.setOnApplyWindowInsetsListener(findViewById(R.id.root), (view, insets) -> {
            Insets edge = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            view.setPadding(edge.left, edge.top, edge.right, edge.bottom);
            return WindowInsetsCompat.CONSUMED;
        });

        web = findViewById(R.id.web);
        offline = findViewById(R.id.offline);
        findViewById(R.id.retry).setOnClickListener(v -> {
            loadFailed = false;
            offline.setVisibility(View.GONE);
            web.reload();
        });
        setUpWeb();

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack();
                else finish();
            }
        });

        if (!handleIntent(getIntent())) web.loadUrl(LinkPolicy.HOME);
    }

    @Override protected void onNewIntent(@NonNull Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override protected void onPause() {
        super.onPause();
        CookieManager.getInstance().flush(); // stay signed in if the phone closes the app
    }

    /** Anything the app was opened with: a notification, a link, a shortcut, or the way back from a browser tab. */
    private boolean handleIntent(Intent intent) {
        if (intent == null) return false;
        String extra = intent.getStringExtra(EXTRA_URL);
        if (extra != null) {
            intent.removeExtra(EXTRA_URL);
            open(extra);
            return true;
        }
        Uri data = intent.getData();
        if (data == null) return false;
        intent.setData(null); // so returning to the app doesn't run it twice
        if ("tcgboogie".equals(data.getScheme())) {
            if ("login".equals(data.getHost())) return finishSignIn(data.getQueryParameter("code"));
            if ("open".equals(data.getHost())) {
                web.loadUrl(LinkPolicy.SITE + LinkPolicy.safeAppPath(data.getQueryParameter("to")));
                return true;
            }
            return false;
        }
        open(data.toString());
        return true;
    }

    /** Sends a URL to the right place (LinkPolicy). */
    private void open(String url) {
        switch (LinkPolicy.targetOf(url)) {
            case APP: web.loadUrl(url); break;
            case SIGN_IN: startSignIn(Uri.parse(url)); break;
            case TAB: openTab(url); break;
            default: openOutside(url);
        }
    }

    private void openTab(String url) {
        CustomTabColorSchemeParams colors = new CustomTabColorSchemeParams.Builder().setToolbarColor(getColor(R.color.boogie_bg)).build();
        try {
            new CustomTabsIntent.Builder().setDefaultColorSchemeParams(colors).build().launchUrl(this, Uri.parse(url));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_LONG).show();
        }
    }

    private void openOutside(String url) {
        Uri uri = Uri.parse(url);
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
        if (!(scheme.equals("https") || scheme.equals("http") || scheme.equals("mailto") || scheme.equals("tel") || scheme.equals("sms"))) return;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, R.string.no_browser, Toast.LENGTH_LONG).show();
        }
    }

    // ---------- signing in (the site's lib/app-login.js has the whole flow) ----------

    private void startSignIn(Uri link) {
        String provider = link.getQueryParameter("provider");
        if (provider == null) return;
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        String verifier = LinkPolicy.base64Url(bytes);
        Prefs.of(this).edit()
            .putString(Prefs.VERIFIER, verifier)
            .putString(Prefs.NEXT, link.getQueryParameter("next"))
            .apply();
        openTab(Uri.parse(LinkPolicy.SITE + "/app-login/start").buildUpon()
            .appendQueryParameter("provider", provider)
            .appendQueryParameter("challenge", LinkPolicy.challengeFor(verifier))
            .build().toString());
    }

    private boolean finishSignIn(String code) {
        SharedPreferences prefs = Prefs.of(this);
        String verifier = prefs.getString(Prefs.VERIFIER, null);
        String next = prefs.getString(Prefs.NEXT, null);
        prefs.edit().remove(Prefs.VERIFIER).remove(Prefs.NEXT).apply();
        if (code == null || verifier == null) return false; // not from a sign-in this app started
        try {
            String form = "code=" + URLEncoder.encode(code, "UTF-8") + "&verifier=" + URLEncoder.encode(verifier, "UTF-8")
                + "&next=" + URLEncoder.encode(next == null ? "/app/home" : next, "UTF-8");
            web.postUrl(LinkPolicy.REDEEM, form.getBytes(StandardCharsets.UTF_8));
            return true;
        } catch (UnsupportedEncodingException e) {
            return false;
        }
    }

    // ---------- the WebView ----------

    @SuppressLint("SetJavaScriptEnabled")
    private void setUpWeb() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSupportMultipleWindows(true); // so links that open a new tab reach onCreateWindow
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setTextZoom(100);
        // Tells the site this is the app (lib/app-shell.js). The rest stays WebView's own: we never pose as Chrome.
        s.setUserAgentString(s.getUserAgentString() + " TCGBoogieApp/" + BuildConfig.VERSION_CODE);
        CookieManager.getInstance().setAcceptCookie(true);
        web.setWebViewClient(client);
        web.setWebChromeClient(chrome);
        web.setDownloadListener((url, userAgent, disposition, mimeType, length) -> download(url, userAgent, disposition, mimeType));

        if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            // Only pages on our own site can reach this, and only in the main frame.
            WebViewCompat.addWebMessageListener(web, "TCGBoogieNative", Collections.singleton(LinkPolicy.SITE),
                (view, message, origin, isMainFrame, reply) -> {
                    if (isMainFrame) onSiteMessage(message.getData(), reply);
                });
        }
    }

    private final WebViewClient client = new WebViewClient() {
        @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            if (!request.isForMainFrame()) return false;
            String url = request.getUrl().toString();
            if (LinkPolicy.targetOf(url) == LinkPolicy.Target.APP) return false;
            open(url);
            return true;
        }

        @Override public void onPageCommitVisible(WebView view, String url) {
            pageShown = true;
        }

        @Override public void onPageFinished(WebView view, String url) {
            if (!loadFailed) offline.setVisibility(View.GONE);
        }

        @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (!request.isForMainFrame()) return;
            loadFailed = true;
            pageShown = true;
            offline.setVisibility(View.VISIBLE);
        }
    };

    private final WebChromeClient chrome = new WebChromeClient() {
        // A link that opens a new tab: catch where it's going, then send it to the right place.
        @Override public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
            WebView popup = new WebView(MainActivity.this);
            popup.setWebViewClient(new WebViewClient() {
                private boolean handled = false;

                private void route(String url) {
                    if (handled || "about:blank".equals(url)) return;
                    handled = true;
                    open(url);
                    popup.post(popup::destroy);
                }

                @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest request) {
                    route(request.getUrl().toString());
                    return true;
                }

                @Override public void onPageStarted(WebView v, String url, Bitmap favicon) {
                    route(url);
                }
            });
            ((WebView.WebViewTransport) resultMsg.obj).setWebView(popup);
            resultMsg.sendToTarget();
            return true;
        }

        @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            cameraPhoto = null;
            boolean images = onlyImages(params.getAcceptTypes());
            Intent pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType(images ? "image/*" : "*/*");
            if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            Intent chooser = Intent.createChooser(pick, getString(R.string.photo_source));
            Intent camera = images ? cameraIntent() : null;
            if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[] {camera});
            try {
                pickFile.launch(chooser);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                callback.onReceiveValue(null);
            }
            return true;
        }
    };

    private static boolean onlyImages(String[] accepts) {
        boolean any = false;
        for (String a : accepts) {
            if (a == null || a.trim().isEmpty()) continue;
            if (!a.startsWith("image/")) return false;
            any = true;
        }
        return any;
    }

    private Uri[] pickedFiles(Intent data) {
        ClipData several = data == null ? null : data.getClipData();
        if (several != null) {
            List<Uri> list = new ArrayList<>();
            for (int i = 0; i < several.getItemCount(); i++) list.add(several.getItemAt(i).getUri());
            return list.toArray(new Uri[0]);
        }
        if (data != null && data.getData() != null) return new Uri[] {data.getData()};
        return cameraPhoto == null ? null : new Uri[] {cameraPhoto}; // the camera app saved it where we asked and returned nothing
    }

    /** The camera app, saving to a private file the site can then upload. Null when that can't be set up. */
    private Intent cameraIntent() {
        try {
            File dir = new File(getCacheDir(), "camera");
            dir.mkdirs();
            File[] old = dir.listFiles();
            if (old != null) for (File f : old) f.delete(); // only the latest photo is ever needed
            cameraPhoto = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", File.createTempFile("card", ".jpg", dir));
            return new Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                .putExtra(MediaStore.EXTRA_OUTPUT, cameraPhoto)
                .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception e) {
            return null;
        }
    }

    /** Saves a download (the collection export) with the member's login, since it's only for them. */
    private void download(String url, String userAgent, String disposition, String mimeType) {
        if (LinkPolicy.targetOf(url) != LinkPolicy.Target.APP) {
            openOutside(url);
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q
            && ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            askStorage.launch(Manifest.permission.WRITE_EXTERNAL_STORAGE);
            Toast.makeText(this, R.string.download_allow, Toast.LENGTH_LONG).show();
            return;
        }
        try {
            String name = URLUtil.guessFileName(url, disposition, mimeType);
            String cookie = CookieManager.getInstance().getCookie(url);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                .addRequestHeader("Cookie", cookie == null ? "" : cookie)
                .addRequestHeader("User-Agent", userAgent)
                .setMimeType(mimeType)
                .setTitle(name)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            getSystemService(DownloadManager.class).enqueue(request);
            Toast.makeText(this, R.string.download_started, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, R.string.download_failed, Toast.LENGTH_LONG).show();
        }
    }

    // ---------- push: what the site's lib/push-client.js asks for ----------

    private void answer(JavaScriptReplyProxy reply, int id, Object... fields) {
        try {
            JSONObject json = new JSONObject().put("id", id);
            for (int i = 0; i + 1 < fields.length; i += 2) json.put((String) fields[i], fields[i + 1]);
            reply.postMessage(json.toString());
        } catch (JSONException e) {
            // Only strings and booleans go in, so this can't happen.
        }
    }

    private boolean firebaseReady() {
        return !FirebaseApp.getApps(this).isEmpty();
    }

    private void onSiteMessage(String data, JavaScriptReplyProxy reply) {
        JSONObject message;
        try {
            message = new JSONObject(data == null ? "" : data);
        } catch (JSONException e) {
            return;
        }
        int id = message.optInt("id");
        switch (message.optString("cmd")) {
            case "push-status": pushStatus(id, reply); break;
            case "push-enable": pushEnable(id, reply); break;
            case "push-disable": pushDisable(id, reply); break;
            default: answer(reply, id, "state", "unsupported");
        }
    }

    private void pushStatus(int id, JavaScriptReplyProxy reply) {
        boolean on = Prefs.of(this).getBoolean(Prefs.PUSH_ON, false);
        if (!on || !firebaseReady() || !NotificationManagerCompat.from(this).areNotificationsEnabled()) {
            answer(reply, id, "enabled", false);
            return;
        }
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful()) answer(reply, id, "enabled", true, "token", task.getResult());
            else answer(reply, id, "enabled", false);
        });
    }

    private void pushEnable(int id, JavaScriptReplyProxy reply) {
        if (!firebaseReady()) {
            answer(reply, id, "state", "unsupported");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            pushWaitingId = id;
            pushWaitingReply = reply;
            askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS);
            return;
        }
        if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) {
            answer(reply, id, "state", "blocked");
            return;
        }
        turnPushOn(id, reply);
    }

    private void turnPushOn(int id, JavaScriptReplyProxy reply) {
        FcmService.createChannel(this);
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (task.isSuccessful()) {
                Prefs.of(this).edit().putBoolean(Prefs.PUSH_ON, true).apply();
                answer(reply, id, "token", task.getResult());
            } else {
                answer(reply, id, "state", "error");
            }
        });
    }

    private void pushDisable(int id, JavaScriptReplyProxy reply) {
        Prefs.of(this).edit().putBoolean(Prefs.PUSH_ON, false).apply();
        answer(reply, id, "ok", true);
    }
}
