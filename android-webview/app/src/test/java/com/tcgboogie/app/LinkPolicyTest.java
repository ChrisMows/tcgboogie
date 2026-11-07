package com.tcgboogie.app;

import static org.junit.Assert.assertEquals;

import com.tcgboogie.app.LinkPolicy.Target;
import java.util.Arrays;
import org.junit.Test;

public class LinkPolicyTest {
    private static void check(Target target, String url) {
        assertEquals(url, target, LinkPolicy.targetOf(url));
    }

    @Test public void ownSiteStaysInTheApp() {
        check(Target.APP, "https://tcgboogie.com/app/home");
        check(Target.APP, "https://www.tcgboogie.com/pricing");
        check(Target.APP, "https://tcgboogie.com/app-login/redeem");
    }

    @Test public void signInStartsInATab() {
        check(Target.SIGN_IN, "https://tcgboogie.com/app-login/start?provider=google&next=%2Fapp");
    }

    @Test public void stripeOpensInATab() {
        check(Target.TAB, "https://checkout.stripe.com/c/pay/cs_live_abc");
        check(Target.TAB, "https://billing.stripe.com/p/session/abc");
    }

    @Test public void connectingAccountsStaysInTheApp() {
        check(Target.APP, "https://discord.com/oauth2/authorize?client_id=1");
        check(Target.APP, "https://discord.com/login?redirect_to=x");
        check(Target.APP, "https://auth.ebay.com/oauth2/authorize?client_id=1");
        check(Target.APP, "https://signin.ebay.com/ws/eBayISAPI.dll");
    }

    @Test public void everythingElseLeaves() {
        for (String url : Arrays.asList(
                "https://www.ebay.com/itm/326629862394",
                "https://discord.com/invite/abc",
                "https://accounts.google.com/o/oauth2/v2/auth",
                "https://www.tcgplayer.com/product/246723",
                "mailto:support@tcgboogie.com",
                "http://tcgboogie.com/app/home",
                "https://tcgboogie.com.evil.example/app",
                "https://evil.example/tcgboogie.com",
                "not a url")) {
            check(Target.OUTSIDE, url);
        }
    }

    @Test public void onlyMemberPagesOpenFromABrowserTab() {
        assertEquals("/app/account?billing=success&session_id=cs_live_abc#plan", LinkPolicy.safeAppPath("/app/account?billing=success&session_id=cs_live_abc#plan"));
        assertEquals("/app/deals", LinkPolicy.safeAppPath("/app/deals"));
        for (String bad : Arrays.asList("https://evil.example/app", "//evil.example/app", "/app/../login", "/appfoo", null)) {
            assertEquals("/app/home", LinkPolicy.safeAppPath(bad));
        }
    }

    /** RFC 7636's example: must match crypto.createHash("sha256").update(verifier).digest("base64url") on the site. */
    @Test public void challengeMatchesTheSite() {
        assertEquals("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", LinkPolicy.challengeFor("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"));
    }

    @Test public void base64HandlesEveryLength() {
        assertEquals("", LinkPolicy.base64Url(new byte[0]));
        assertEquals("Zg", LinkPolicy.base64Url("f".getBytes()));
        assertEquals("Zm8", LinkPolicy.base64Url("fo".getBytes()));
        assertEquals("Zm9v", LinkPolicy.base64Url("foo".getBytes()));
        assertEquals("-_-_", LinkPolicy.base64Url(new byte[] {(byte) 0xfb, (byte) 0xff, (byte) 0xbf}));
    }
}
