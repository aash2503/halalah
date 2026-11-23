package com.aash.halalah;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.os.Bundle;

/** Home-screen widget (medium, 3 x 2). All the drawing is in Widgets.java. */
public class WidgetMedium extends AppWidgetProvider {
    @Override public void onUpdate(Context c, AppWidgetManager m, int[] ids) { Widgets.refresh(c); }
    @Override public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle o) { Widgets.refresh(c); }
    @Override public void onEnabled(Context c) { Widgets.refresh(c); }
}
