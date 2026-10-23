package com.advikchaba.routinery;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

import java.util.Calendar;
import java.util.List;

/** Schedules one alarm per task, then lets the receiver arm the next day. */
public final class ReminderScheduler {
    public static final String ACTION_REMINDER = "com.advikchaba.routinery.REMINDER";
    public static final String EXTRA_TASK_ID = "task_id";

    private ReminderScheduler() {
    }

    /** Replaces the stored schedule and cancels alarms for tasks that disappeared. */
    public static void sync(Context context, List<ReminderTask> tasks) {
        List<ReminderTask> previous = ReminderStore.load(context);
        for (ReminderTask task : previous) {
            cancel(context, task.id);
        }
        ReminderStore.save(context, tasks);
        for (ReminderTask task : tasks) {
            schedule(context, task);
        }
    }

    /** Re-arms every stored task, used after a reboot or an app update. */
    public static void rescheduleAll(Context context) {
        for (ReminderTask task : ReminderStore.load(context)) {
            schedule(context, task);
        }
    }

    public static void schedule(Context context, ReminderTask task) {
        scheduleAt(context, task, nextTrigger(task));
    }

    /**
     * Arms the next calendar day. Used after a reminder fires so an early
     * inexact delivery cannot create a second alarm for the same day.
     */
    public static void scheduleNextDay(Context context, ReminderTask task) {
        Calendar calendar = Calendar.getInstance();
        calendar.set(Calendar.HOUR_OF_DAY, task.hour());
        calendar.set(Calendar.MINUTE, task.minute());
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        calendar.add(Calendar.DAY_OF_YEAR, 1);
        scheduleAt(context, task, calendar.getTimeInMillis());
    }

    private static void scheduleAt(Context context, ReminderTask task, long triggerAt) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) {
            return;
        }

        Intent intent = new Intent(context, ReminderReceiver.class)
                .setAction(ACTION_REMINDER)
                .putExtra(EXTRA_TASK_ID, task.id);
        PendingIntent pending = PendingIntent.getBroadcast(
                context,
                requestCode(task.id),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarms.canScheduleExactAlarms()) {
                alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
            } else {
                alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
            }
        } catch (SecurityException error) {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pending);
        }
    }

    public static void cancel(Context context, int taskId) {
        AlarmManager alarms = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (alarms == null) {
            return;
        }
        Intent intent = new Intent(context, ReminderReceiver.class).setAction(ACTION_REMINDER);
        PendingIntent pending = PendingIntent.getBroadcast(
                context,
                requestCode(taskId),
                intent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        alarms.cancel(pending);
        pending.cancel();
    }

    private static int requestCode(int taskId) {
        return taskId & 0x7fffffff;
    }

    private static long nextTrigger(ReminderTask task) {
        Calendar calendar = Calendar.getInstance();
        calendar.set(Calendar.HOUR_OF_DAY, task.hour());
        calendar.set(Calendar.MINUTE, task.minute());
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        if (calendar.getTimeInMillis() <= System.currentTimeMillis() + 1000L) {
            calendar.add(Calendar.DAY_OF_YEAR, 1);
        }
        return calendar.getTimeInMillis();
    }
}
