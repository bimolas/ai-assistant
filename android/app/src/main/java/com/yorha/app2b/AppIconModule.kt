package com.yorha.app2b

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.util.Base64
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.io.ByteArrayOutputStream

class AppIconModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String {
    return "AppIcon"
  }

  @ReactMethod
  fun getAppIcon(packageName: String?, promise: Promise) {
    if (packageName == null) {
      promise.resolve(null)
      return
    }

    try {
      val pm = reactApplicationContext.packageManager
      val drawable: Drawable = pm.getApplicationIcon(packageName)

      val bitmap: Bitmap = if (drawable is BitmapDrawable) {
        drawable.bitmap
      } else {
        val width = if (drawable.intrinsicWidth > 0) drawable.intrinsicWidth else 1
        val height = if (drawable.intrinsicHeight > 0) drawable.intrinsicHeight else 1
        val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        drawable.setBounds(0, 0, canvas.width, canvas.height)
        drawable.draw(canvas)
        bmp
      }

      val stream = ByteArrayOutputStream()
      bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
      val bytes = stream.toByteArray()
      val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
      val dataUri = "data:image/png;base64,$base64"
      promise.resolve(dataUri)
    } catch (e: Exception) {
      // On any failure, resolve null so JS can fallback to default icons
      promise.resolve(null)
    }
  }
}
