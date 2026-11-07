# TCG Boogie for Android (WebView build)

A small native app that shows tcgboogie.com in a WebView, built as a possible replacement for the Trusted Web Activity
in `../android-app/`, which stays as it is. Both use the package `com.tcgboogie.app` and the same upload key, so this
installs as an update to it. Site changes reach the app on their own; only changes in this folder need a new upload.

## What the app adds to the website

| What | How | Where |
|---|---|---|
| Google and Discord sign-in | A browser tab, then a one-time code back to the app. Google refuses sign-in inside a WebView | `MainActivity`, `web/lib/app-login.js`, `web/app/app-login/` |
| Push alerts | Firebase, because a WebView can't use web push | `FcmService`, `web/lib/fcm.js`, `web/lib/push-client.js` |
| Camera and uploads | The phone's picker, with a camera option for images | `onShowFileChooser` |
| Collection export | Android's download manager, carrying the member's login | `download` |
| Which links stay and which leave | Stripe opens in a browser tab; eBay and other sites leave the app | `LinkPolicy` |
| Back button, offline screen, splash, screen edges | Native | `MainActivity` |

The site spots the app from `TCGBoogieApp/<version>` in the user agent (`web/lib/app-shell.js`). Website visitors see no change.

Connecting Google to an existing account, and refreshing a Google picture, stay on the website: they need Google's
sign-in with the app's login, which a WebView can't do. The account page says so in the app.

## Build

From this folder, in PowerShell. It uses Bubblewrap's Java and Android SDK. That Java is 32-bit, which is why the app is
written in Java rather than Kotlin and `gradle.properties` keeps the memory low.

```
$env:JAVA_HOME = "$env:USERPROFILE\.bubblewrap\jdk\jdk-17.0.11+9"
Remove-Item Env:NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug
```

`local.properties` isn't committed. On a new checkout, create it with `sdk.dir=C:/Users/<you>/.bubblewrap/android_sdk`.

- **To try on a phone:** `app/build/outputs/apk/debug/app-debug.apk`. It's signed with a debug key, so it can't install
  over a Play copy of the app: uninstall that first. Sign-ins and push work against the live site, so its changes have to be deployed.
- **To upload to Play:** raise `versionCode` in `app/build.gradle` if this version was already uploaded, then run
  `powershell -ExecutionPolicy Bypass -File .uild-release.ps1`. It asks for the upload key's password and checks the
  signature. The key is `%USERPROFILE%\.tcgboogie\android-upload-2.jks`, made on 2026-11-07 by `new-upload-key.ps1` for an
  upload key reset, because the first key's password was lost. Keep the file and its password in a password manager.

## Firebase (needed for push alerts)

Without these the app still works, and switching push on says it couldn't.

1. Create a project at console.firebase.google.com and add an Android app with the package `com.tcgboogie.app`.
2. Download `google-services.json` into `app/`. It stays out of git.
3. Project settings → Service accounts → Generate new private key. Put that JSON file's contents, as they are or in
   base64, in Hostinger's environment variable `FCM_SERVICE_ACCOUNT`, then download a fresh settings backup from Admin → Status.

## Test on a real phone before uploading

The local preview has no database, so these can only be proven on a phone against the live site.

- **Sign-in:** Google, Discord and the email link. Reopen the app and force-stop it: still signed in? Sign out and back in. Google with a browser that's already signed in (the "Continue as" page), and "Use a different account".
- **Push:** switch on and allow, send a test, tap it with the app closed, switch off. Refuse permission once. Check a listing alert opens eBay.
- **Photos and files:** card scanner by camera and from the gallery, Add cards photo, Sell on eBay photos (several), collection import, collection export.
- **Links:** an eBay listing, the sold-listings button on a deal, TCGplayer, a mailto link, a shared profile, copy and share. Tap an emailed alert link: does it open in the app?
- **Connecting accounts:** Connect Discord and Connect eBay in Settings, then list a card.
- **Payments:** start checkout and cancel it, open the billing page and return: both should come back to the app.
- **The app itself:** back button through pages and out, airplane mode then Try again, the three home-screen shortcuts, keyboard over forms, the bottom tab bar against the phone's navigation bar, and a phone with a notch.

## Before an upload

- Update Play's Data safety answers: `../android-app/store-listing.md` has the new line.
- Keep `https://tcgboogie.com/.well-known/assetlinks.json` as it is (`web/app/api/assetlinks/route.js`). Links that open the app rely on the same two keys.
- Use this same build for production. Testing one app and sending a thinner one to production can count as deceptive under Google's rules.
