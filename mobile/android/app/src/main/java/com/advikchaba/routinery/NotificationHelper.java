package com.advikchaba.routinery;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import java.util.Locale;

/** Builds the task reminder notification and its channel. */
public final class NotificationHelper {
    private static final String CHANNEL_ID = "task_reminders";
    private static final String GROUP_KEY = "routinery_tasks";

    private NotificationHelper() {
    }

    public static void ensureChannel(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Task reminders",
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Notifications at your scheduled task times.");
        channel.enableVibration(true);
        manager.createNotificationChannel(channel);
    }

    public static void showTaskReminder(Context context, ReminderTask task) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            return;
        }

        ensureChannel(context);

        Intent open = new Intent(context, LauncherActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending = PendingIntent.getActivity(
                context,
                task.id,
                open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String body = "Scheduled for " + formatTime(task.time) + ". Tap to open DayGuide.";
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(task.title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setGroup(GROUP_KEY)
                .setAutoCancel(true)
                .setContentIntent(openPending);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !canScheduleExactAlarms(context)) {
            try {
                Intent settingsIntent = new Intent(
                        Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + context.getPackageName())
                ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                PendingIntent settingsPending = PendingIntent.getActivity(
                        context,
                        task.id + 100000,
                        settingsIntent,
                        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                );
                builder.addAction(0, "Allow exact timing", settingsPending);
            } catch (Exception ignored) {
                // Some OEMs do not expose the exact-alarm settings screen.
            }
        }

        NotificationManagerCompat.from(context).notify(task.id, builder.build());
    }

    public static boolean canScheduleExactAlarms(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            return true;
        }
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        return alarms != null && alarms.canScheduleExactAlarms();
    }

    private static String formatTime(String hhmm) {
        int hour = Integer.parseInt(hhmm.substring(0, 2));
        int minute = Integer.parseInt(hhmm.substring(3, 5));
        String suffix = hour >= 12 ? "PM" : "AM";
        int displayHour = hour % 12;
        if (displayHour == 0) {
            displayHour = 12;
        }
        return String.format(Locale.US, "%d:%02d %s", displayHour, minute, suffix);
    }
}
