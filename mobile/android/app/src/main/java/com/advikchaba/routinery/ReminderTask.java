package com.advikchaba.routinery;

import org.json.JSONException;
import org.json.JSONObject;

/** A single scheduled task mirrored from the web app. */
public final class ReminderTask {
    public final int id;
    public final String title;
    public final String time;

    public ReminderTask(int id, String title, String time) {
        this.id = id;
        this.title = title;
        this.time = time;
    }

    public int hour() {
        return Integer.parseInt(time.substring(0, 2));
    }

    public int minute() {
        return Integer.parseInt(time.substring(3, 5));
    }

    public JSONObject toJson() throws JSONException {
        return new JSONObject()
                .put("id", id)
                .put("title", title)
                .put("time", time);
    }

    public static ReminderTask fromJson(JSONObject object) {
        int id = object.optInt("id", -1);
        String title = object.optString("title", "").trim();
        String time = object.optString("time", "").trim();
        if (id <= 0 || title.isEmpty() || !isValidTime(time)) {
            return null;
        }
        if (title.length() > 120) {
            title = title.substring(0, 120);
        }
        return new ReminderTask(id, title, time);
    }

    public static boolean isValidTime(String value) {
        if (value == null || value.length() != 5 || value.charAt(2) != ':') {
            return false;
        }
        try {
            int hour = Integer.parseInt(value.substring(0, 2));
            int minute = Integer.parseInt(value.substring(3, 5));
            return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
        } catch (NumberFormatException error) {
            return false;
        }
    }
}
