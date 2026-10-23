package com.advikchaba.routinery;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/** Persists the last task schedule synced from the web app. */
public final class ReminderStore {
    private static final String PREFS = "routinery_reminders";
    private static final String KEY_TASKS = "tasks";
    private static final String KEY_SYNCED_AT = "synced_at";

    private ReminderStore() {
    }

    public static synchronized List<ReminderTask> load(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY_TASKS, "[]");
        List<ReminderTask> tasks = new ArrayList<>();
        try {
            JSONArray array = new JSONArray(raw);
            for (int i = 0; i < array.length(); i++) {
                JSONObject object = array.optJSONObject(i);
                if (object == null) {
                    continue;
                }
                ReminderTask task = ReminderTask.fromJson(object);
                if (task != null) {
                    tasks.add(task);
                }
            }
        } catch (Exception error) {
            prefs.edit().remove(KEY_TASKS).apply();
        }
        return tasks;
    }

    public static synchronized void save(Context context, List<ReminderTask> tasks) {
        JSONArray array = new JSONArray();
        for (ReminderTask task : tasks) {
            try {
                array.put(task.toJson());
            } catch (Exception ignored) {
                // Skip a malformed row rather than losing the whole schedule.
            }
        }
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        // Commit synchronously so the schedule is durable before alarms are armed.
        prefs.edit()
                .putString(KEY_TASKS, array.toString())
                .putLong(KEY_SYNCED_AT, System.currentTimeMillis())
                .commit();
    }

    public static synchronized ReminderTask find(Context context, int id) {
        for (ReminderTask task : load(context)) {
            if (task.id == id) {
                return task;
            }
        }
        return null;
    }
}
