package com.yorha.app2b

import android.content.Intent
import android.content.ComponentName
import android.content.pm.PackageManager
import android.util.Log
import com.facebook.react.bridge.*

class LauncherModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val TAG = "LauncherModule"
    init {
        Log.d(TAG, "LauncherModule initialized")
    }

    override fun getName(): String = "LauncherModule"

    @ReactMethod
    fun getLaunchableApps(promise: Promise) {
        Log.d(TAG, "getLaunchableApps called")
        try {
            val pm = reactContext.packageManager
            val intent = Intent(Intent.ACTION_MAIN, null)
            intent.addCategory(Intent.CATEGORY_LAUNCHER)

            val apps = pm.queryIntentActivities(intent, 0)
            val result = Arguments.createArray()

            for (info in apps) {
                val app = Arguments.createMap()
                app.putString("packageName", info.activityInfo.packageName)
                app.putString("activityName", info.activityInfo.name)
                app.putString(
                    "appName",
                    info.loadLabel(pm).toString()
                )
                result.pushMap(app)
            }

            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "getLaunchableApps error", e)
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun launchApp(packageName: String, activityName: String, promise: Promise) {
        Log.d(TAG, "launchApp called package=$packageName activity=$activityName")
        try {
            val intent = Intent(Intent.ACTION_MAIN)
            intent.addCategory(Intent.CATEGORY_LAUNCHER)
            intent.component = ComponentName(packageName, activityName)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "launchApp error", e)
            promise.reject("ERROR", e.message)
        }
    }
}