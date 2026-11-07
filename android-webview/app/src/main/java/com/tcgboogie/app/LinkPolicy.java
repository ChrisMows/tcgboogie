package com.tcgboogie.app;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.regex.Pattern;

/** Decides where every link goes. No Android classes except the encoder below, so app/src/test can run it on a computer. */
final class LinkPolicy {
    static final String HOST = "tcgboogie.com";
    static final String SITE = "https://" + HOST;
    static final String HOME = SITE + "/app/home";
    static final String REDEEM = SITE + "/app-login/redeem";

    enum Target {
        /** Stays in the app. */
        APP,
        /** The app's sign-in: opens a browser tab with the app's secret (lib/app-login.js on the site). */
        SIGN_IN,
        /** A browser tab that comes back to the app: Stripe's checkout and billing pages. */
        TAB,
        /** Leaves the app: eBay's own app or the browser, mail, and everything else. */
        OUTSIDE
    }

    // The same rule as safeAppPath in the site's lib/app-shell.js.
    private static final Pattern APP_PATH = Pattern.compile("^/app(/[\\w\\-/%.]*)?(\\?[\\w\\-=&%.]*)?(#[\\w-]*)?$");

    private LinkPolicy() {}

    static Target targetOf(String url) {
        URI uri;
        try {
            uri = new URI(url);
        } catch (Exception e) {
            return Target.OUTSIDE;
        }
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null) return Target.OUTSIDE;
        String host = uri.getHost().toLowerCase();
        String path = uri.getPath() == null ? "" : uri.getPath();
        if (host.equals(HOST) || host.equals("www." + HOST)) {
            return path.equals("/app-login/start") ? Target.SIGN_IN : Target.APP;
        }
        if (host.equals("checkout.stripe.com") || host.equals("billing.stripe.com")) return Target.TAB;
        // Connecting a Discord or eBay account from Settings finishes back on the site, so it needs the app's login.
        if (host.equals("discord.com") && (path.startsWith("/oauth2") || path.startsWith("/login") || path.startsWith("/api/"))) return Target.APP;
        if (host.equals("auth.ebay.com") || host.equals("signin.ebay.com") || host.equals("auth2.ebay.com")) return Target.APP;
        return Target.OUTSIDE;
    }

    /** A member page to open after coming back from a browser tab. Anything else opens Home. */
    static String safeAppPath(String path) {
        return path != null && !path.contains("..") && APP_PATH.matcher(path).matches() ? path : "/app/home";
    }

    /** The hash of the app's secret that goes through the browser. The site checks it with the secret itself. */
    static String challengeFor(String verifier) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.UTF_8));
            return base64Url(hash);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** URL-safe base64 with no padding (java.util.Base64 needs Android 8, and the app supports 7). */
    static String base64Url(byte[] bytes) {
        final String letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        StringBuilder out = new StringBuilder();
        for (int i = 0; i < bytes.length; i += 3) {
            int b0 = bytes[i] & 0xff;
            int b1 = i + 1 < bytes.length ? bytes[i + 1] & 0xff : 0;
            int b2 = i + 2 < bytes.length ? bytes[i + 2] & 0xff : 0;
            out.append(letters.charAt(b0 >> 2));
            out.append(letters.charAt(((b0 & 3) << 4) | (b1 >> 4)));
            if (i + 1 < bytes.length) out.append(letters.charAt(((b1 & 15) << 2) | (b2 >> 6)));
            if (i + 2 < bytes.length) out.append(letters.charAt(b2 & 63));
        }
        return out.toString();
    }
}
