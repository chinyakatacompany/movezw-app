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
    public static final String JOB_ALERTS_CHANNEL_ID = "job_alerts";

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
        channel.setVibrationPattern(new long[]{0, 500});
        channel.enableLights(true);
        channel.setLightColor(Color.parseColor("#ea580c"));
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }
}
