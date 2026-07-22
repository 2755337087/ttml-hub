package com.example.app.lyrics

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.io.IOException
import java.util.concurrent.TimeUnit

class TtmlHubSyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result = try {
        TtmlHubClient(applicationContext).syncIfNeeded(force = true)
        Result.success()
    } catch (_: IOException) {
        Result.retry()
    } catch (_: Exception) {
        Result.failure()
    }

    companion object {
        private const val UNIQUE_WORK_NAME = "ttml-hub-index-sync"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<TtmlHubSyncWorker>(6, TimeUnit.HOURS).build()
            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                UNIQUE_WORK_NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }
    }
}
