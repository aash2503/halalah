package com.aash.halalah;

import android.app.job.JobParameters;
import android.app.job.JobService;

/** Background check for a newer version of the web app; pings the phone when one was downloaded. */
public class UpdateJob extends JobService {
    @Override
    public boolean onStartJob(final JobParameters params) {
        new Thread(() -> {
            try {
                int build = Updater.check(getApplicationContext());
                if (build > 0) Updater.notifyUpdated(getApplicationContext(), build, Updater.notes());
            } finally { jobFinished(params, false); }
        }).start();
        return true;
    }
    @Override
    public boolean onStopJob(JobParameters params) { return true; }
}
