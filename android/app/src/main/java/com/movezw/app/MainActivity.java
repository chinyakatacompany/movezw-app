package com.movezw.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Job-alert push notifications need a dedicated channel with a strong,
    // consistent vibration pattern — Android locks a channel's sound/
    // vibration at creation time and never lets the app change it later
    // (only the user can, via system settings), unlike the web push path
    // where the vibration pattern is chosen per-message from the user's
    // notification_vibration profile setting.
    //
    // _v2: a channel's settings are immutable once created on a device, so
    // bumping the vibration pattern here would silently do nothing for
    // anyone who already has the app installed — the OS just keeps using
    // whatever channel already exists under that id. A new id forces a
    // fresh channel with the new pattern instead of a no-op update.
    public static final String JOB_ALERTS_CHANNEL_ID = "job_alerts_v2";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createJobAlertsChannel();
    }

    private void createJobAlertsChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
                JOB_ALERTS_CHANNEL_ID,
                "Job alerts",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("New transport job requests and offers");
        channel.enableVibration(true);
        // A single 500ms buzz read as barely different from a normal
        // notification — a real double-buzz is what actually feels "long".
        channel.setVibrationPattern(new long[]{0, 600, 200, 600});
        channel.enableLights(true);
        channel.setLightColor(Color.parseColor("#dc2626"));
        // Requests a launcher badge/dot for every job alert. Android's
        // launcher decides whether that is rendered as a red dot or a
        // numbered badge, but this channel must explicitly allow it.
        channel.setShowBadge(true);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }
}
