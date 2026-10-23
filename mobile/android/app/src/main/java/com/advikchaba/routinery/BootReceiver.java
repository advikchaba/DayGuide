package com.advikchaba.routinery;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Re-arms reminders after reboot, time changes, or an app update. */
public final class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        ReminderScheduler.rescheduleAll(context);
    }
}
