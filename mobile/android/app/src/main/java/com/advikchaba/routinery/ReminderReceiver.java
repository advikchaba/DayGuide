package com.advikchaba.routinery;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Posts the reminder at the task time and arms the next day's alarm. */
public final class ReminderReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        int taskId = intent.getIntExtra(ReminderScheduler.EXTRA_TASK_ID, -1);
        if (taskId <= 0) {
            return;
        }
        ReminderTask task = ReminderStore.find(context, taskId);
        if (task == null) {
            return;
        }
        NotificationHelper.showTaskReminder(context, task);
        ReminderScheduler.scheduleNextDay(context, task);
    }
}
