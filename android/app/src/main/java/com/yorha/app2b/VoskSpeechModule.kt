package com.yorha.app2b

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.vosk.Model
import org.vosk.Recognizer
import org.vosk.android.RecognitionListener
import org.json.JSONObject
import org.vosk.android.StorageService
import org.vosk.android.SpeechService

class VoskSpeechModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  private var model: Model? = null
  private var recognizer: Recognizer? = null
  private var speechService: SpeechService? = null
  private val MODEL_ASSET_NAME = "model"
  private val SAMPLE_RATE = 16000.0f

  override fun getName(): String {
    return "VoskSpeech"
  }

  @ReactMethod
  fun initModel(promise: Promise) {
    try {
      // Synchronously ensure model files are available and load the model.
      // StorageService.sync will copy assets to storage and return the path.
      val path = StorageService.sync(reactApplicationContext, MODEL_ASSET_NAME, MODEL_ASSET_NAME)
      model = org.vosk.Model(path)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("MODEL_INIT_ERROR", e)
    }
  }

  @ReactMethod
  fun startListening() {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      sendEvent("VoskSpeechError", null)
      return
    }

    if (ActivityCompat.checkSelfPermission(reactApplicationContext, Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      sendEvent("VoskPermissionRequired", null)
      return
    }

    try {
      if (model == null) {
        try {
          val path = StorageService.sync(reactApplicationContext, MODEL_ASSET_NAME, MODEL_ASSET_NAME)
          model = org.vosk.Model(path)
        } catch (ioe: Exception) {
          val map = Arguments.createMap()
          map.putString("error", ioe.message ?: "model init failed")
          sendEvent("VoskSpeechError", map)
          return
        }
      }
      startRecognizer()
    } catch (e: Exception) {
      val map = Arguments.createMap()
      map.putString("error", e.message ?: "unknown")
      sendEvent("VoskSpeechError", map)
    }
  }

  private fun startRecognizer() {
    try {
      val m = model ?: return
      recognizer = Recognizer(m, SAMPLE_RATE)
      speechService = SpeechService(recognizer, SAMPLE_RATE)
      speechService?.startListening(object : RecognitionListener {
        override fun onResult(result: String) {
          try {
            val j = JSONObject(result)
            val text = j.optString("text", "")
            val map = Arguments.createMap()
            map.putString("text", text)
            map.putBoolean("final", true)
            sendEvent("VoskSpeechResult", map)
          } catch (e: Exception) {
            // parsing error
          }
        }

        override fun onPartialResult(partial: String) {
          try {
            val j = JSONObject(partial)
            val text = j.optString("partial", "")
            val map = Arguments.createMap()
            map.putString("text", text)
            map.putBoolean("final", false)
            sendEvent("VoskSpeechResult", map)
          } catch (e: Exception) {
            // parsing error
          }
        }

        override fun onFinalResult(finalResult: String) {
          try {
            val j = JSONObject(finalResult)
            val text = j.optString("text", "")
            val map = Arguments.createMap()
            map.putString("text", text)
            map.putBoolean("final", true)
            sendEvent("VoskSpeechResult", map)
          } catch (e: Exception) {
            // parsing error
          }
        }

        override fun onError(exception: Exception?) {
          val map = Arguments.createMap()
          map.putString("error", exception?.message ?: "unknown")
          sendEvent("VoskSpeechError", map)
        }

        override fun onTimeout() {
          // optional
        }
      })
    } catch (e: Exception) {
      val map = Arguments.createMap()
      map.putString("error", e.message ?: "unknown")
      sendEvent("VoskSpeechError", map)
    }
  }

  @ReactMethod
  fun stopListening() {
    try {
      speechService?.stop()
    } catch (e: Exception) {
      // ignore
    } finally {
      speechService = null
      recognizer?.close()
      recognizer = null
    }
  }

  private fun sendEvent(name: String, params: com.facebook.react.bridge.WritableMap?) {
    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(name, params)
  }
}
