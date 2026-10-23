package com.advikchaba.routinery;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Base64;
import android.widget.Toast;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Receives the task schedule from the web app through
 * {@code routinery://sync-reminders?data=<base64url-json>}.
 */
public final class ReminderSyncActivity extends Activity {
    private static final int REQUEST_NOTIFICATIONS = 4101;
    private static final int REQUEST_EXACT_ALARM = 4102;
    private static final int MAX_TASKS = 200;
    private static final int MAX_PAYLOAD_LENGTH = 100_000;

    private static final long EXACT_SETTINGS_RETURN_GRACE_MS = 600L;

    private List<ReminderTask> pendingTasks;
    private boolean finished = false;
    private boolean awaitingExactSettings = false;
    private boolean activityPaused = false;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable finishAfterExactSettings = () -> {
        if (awaitingExactSettings) {
            awaitingExactSettings = false;
            finishSync();
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Uri data = getIntent() == null ? null : getIntent().getData();
        if (data == null
                || !"routinery".equals(data.getScheme())
                || !"sync-reminders".equals(data.getHost())) {
            toast("Could not read the reminder schedule.");
            finish();
            return;
        }
        String payload = data.getQueryParameter("data");
        if (payload == null || payload.isEmpty() || payload.length() > MAX_PAYLOAD_LENGTH) {
            toast("Could not read the reminder schedule.");
            finish();
            return;
        }

        try {
            pendingTasks = parsePayload(payload);
        } catch (Exception error) {
            toast("Could not read the reminder schedule.");
            finish();
            return;
        }

        if (pendingTasks.isEmpty()) {
            toast("No scheduled tasks to remind you about.");
            finish();
            return;
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    REQUEST_NOTIFICATIONS
            );
            return;
        }

        continueAfterNotifications();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != REQUEST_NOTIFICATIONS) {
            return;
        }
        if (grantResults.length == 0 || grantResults[0] != PackageManager.PERMISSION_GRANTED) {
            toast("Notifications are off. Enable them in Android Settings to see reminders.");
        }
        continueAfterNotifications();
    }

    private void continueAfterNotifications() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && !NotificationHelper.canScheduleExactAlarms(this)) {
            try {
                Intent intent = new Intent(
                        Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM,
                        Uri.parse("package:" + getPackageName())
                );
                awaitingExactSettings = true;
                activityPaused = false;
                handler.removeCallbacks(finishAfterExactSettings);
                startActivityForResult(intent, REQUEST_EXACT_ALARM);
                return;
            } catch (Exception ignored) {
                // Fall back to inexact alarms below.
            }
        }
        finishSync();
    }

    @Override
    protected void onPause() {
        super.onPause();
        activityPaused = true;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (awaitingExactSettings && activityPaused) {
            // Some OEM settings screens never deliver onActivityResult. Give the
            // settings activity a moment to open before using the resume fallback.
            handler.postDelayed(finishAfterExactSettings, EXACT_SETTINGS_RETURN_GRACE_MS);
        }
        activityPaused = false;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQUEST_EXACT_ALARM) {
            awaitingExactSettings = false;
            handler.removeCallbacks(finishAfterExactSettings);
            finishSync();
        }
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(finishAfterExactSettings);
        super.onDestroy();
    }

    private void finishSync() {
        if (finished) {
            return;
        }
        finished = true;

        ReminderScheduler.sync(this, pendingTasks);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                && !NotificationHelper.canScheduleExactAlarms(this)) {
            toast("Reminders enabled. Allow Alarms & reminders for exact timing.");
        } else {
            toast("Reminders enabled for " + pendingTasks.size() + " task"
                    + (pendingTasks.size() == 1 ? "." : "s."));
        }
        finish();
    }

    private List<ReminderTask> parsePayload(String encoded) throws Exception {
        byte[] bytes = Base64.decode(
                encoded,
                Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING
        );
        String json = new String(bytes, StandardCharsets.UTF_8);
        JSONObject root = new JSONObject(json);
        JSONArray rows = root.optJSONArray("tasks");
        List<ReminderTask> tasks = new ArrayList<>();
        if (rows == null) {
            return tasks;
        }

        Set<Integer> seen = new HashSet<>();
        for (int i = 0; i < rows.length() && tasks.size() < MAX_TASKS; i++) {
            JSONObject row = rows.optJSONObject(i);
            if (row == null) {
                continue;
            }
            ReminderTask task = ReminderTask.fromJson(row);
            if (task != null && seen.add(task.id)) {
                tasks.add(task);
            }
        }
        return tasks;
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show();
    }
}
