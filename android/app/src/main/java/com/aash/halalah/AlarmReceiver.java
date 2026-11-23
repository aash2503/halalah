package com.aash.halalah;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** A reminder came due, or the phone restarted / the app was updated / the clock changed and the alarm must be set again. */
public class AlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context c, Intent i) {
        String a = i == null ? null : i.getAction();
        if (Reminders.ACTION.equals(a)) Reminders.fire(c);
        else if (Widgets.ACTION.equals(a)) Widgets.refresh(c);
        else { Reminders.arm(c); Widgets.refresh(c); }
    }
}
