package com.tcgboogie.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;

/** Shows the site's push alerts (the site's lib/fcm.js sends them), like public/sw.js does for web push. */
public class FcmService extends FirebaseMessagingService {
    private static final String CHANNEL = "alerts";

    static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        context.getSystemService(NotificationManager.class).createNotificationChannel(
            new NotificationChannel(CHANNEL, context.getString(R.string.alerts_channel), NotificationManager.IMPORTANCE_HIGH));
    }

    @Override public void onMessageReceived(@NonNull RemoteMessage message) {
        if (!Prefs.of(this).getBoolean(Prefs.PUSH_ON, false)) return;
        Map<String, String> data = message.getData();
        String title = data.get("title");
        if (title == null || title.isEmpty()) return;
        String body = data.get("body");
        String url = data.get("url");
        if (url == null || url.isEmpty()) url = LinkPolicy.SITE + "/app/deals";
        String tag = data.get("tag");

        createChannel(this);
        Intent open = new Intent(this, MainActivity.class)
            .putExtra(MainActivity.EXTRA_URL, url)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // The same tag replaces the last alert, as web push does.
        int id = tag != null && !tag.isEmpty() ? tag.hashCode() : (int) System.currentTimeMillis();
        PendingIntent tap = PendingIntent.getActivity(this, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder notification = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_boogie)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setColor(getColor(R.color.boogie_accent))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(tap);
        try {
            NotificationManagerCompat.from(this).notify(id, notification.build());
        } catch (SecurityException e) {
            // Notifications were turned off in the phone's settings.
        }
    }

    // The site asks for the current token each time a page loads (syncAppPush), so a new one needs no work here.
    @Override public void onNewToken(@NonNull String token) {}
}
