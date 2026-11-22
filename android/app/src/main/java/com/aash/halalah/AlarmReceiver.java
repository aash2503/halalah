package com.aash.halalah;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** A reminder came due, or the phone restarted / the app was updated / the clock changed and the alarm must be set again. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        if (i != null && Reminders.ACTION.equals(i.getAction())) Reminders.fire(c);
        else Reminders.arm(c);
    }
}
