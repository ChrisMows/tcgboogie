package com.tcgboogie.app;

import android.content.Context;
import android.content.SharedPreferences;

final class Prefs {
    static final String PUSH_ON = "push_on";
    static final String VERIFIER = "login_verifier"; // the secret for a sign-in in progress in a browser tab
    static final String NEXT = "login_next"; // the page to open after it

    private Prefs() {}

    static SharedPreferences of(Context context) {
        return context.getSharedPreferences("boogie", Context.MODE_PRIVATE);
    }
}
