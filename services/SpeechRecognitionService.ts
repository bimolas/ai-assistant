import { DeviceEventEmitter, NativeModules, PermissionsAndroid, Platform } from "react-native";
import { Audio } from "expo-av";
import * as Speech from "expo-speech";

export class SpeechRecognitionService {
  private voskEventEmitter: any = null;
  private voskSubscription: any = null;
  private voskErrorSubscription: any = null;
  private voskPermissionSubscription: any = null;
  private voskModelInitialized: boolean = false;
  private lastVoskFinal: string | null = null;
  private voskUtteranceTimer: any = null;
  private voskMaxListenTimer: any = null;
  private voskPaused = false;
  private haveMicPermission: boolean = false;
  private usingVosk = false;
  private currentInterim = "";
  private voskDebug = true;
  private isListening = false;
  private processingCommand = false;
  private preventRecordingDuringSpeak = false;
  
  // Constants
  private VOSK_UTTERANCE_TIMEOUT_MS = 1200;
  private VOSK_CHUNK_MS = 5000;
  
  // Callbacks
  private onResult?: (text: string) => void;
  private onError?: (error: string) => void;
  private onStatusUpdate?: (message: string) => void;
  private onProcessingStateChange?: (processing: boolean) => void;
  private onListeningStateChange?: (listening: boolean) => void;
  private processCommand?: (text: string) => Promise<any>;
  private speak?: (text: string) => Promise<void>;
  
  constructor(
    onResult?: (text: string) => void,
    onError?: (error: string) => void,
    onStatusUpdate?: (message: string) => void,
    onProcessingStateChange?: (processing: boolean) => void,
    onListeningStateChange?: (listening: boolean) => void,
    processCommand?: (text: string) => Promise<any>,
    speak?: (text: string) => Promise<void>
  ) {
    this.onResult = onResult;
    this.onError = onError;
    this.onStatusUpdate = onStatusUpdate;
    this.onProcessingStateChange = onProcessingStateChange;
    this.onListeningStateChange = onListeningStateChange;
    this.processCommand = processCommand;
    this.speak = speak;
  }
  
  async ensureVoskModel(): Promise<boolean> {
    if (this.voskModelInitialized) return true;
    try {
      const mod = (NativeModules as any).VoskSpeech;
      if (!mod || typeof mod.initModel !== "function") {
        if (this.voskDebug)
          console.warn("ensureVoskModel: native module missing");
        return false;
      }
      await mod.initModel();
      this.voskModelInitialized = true;
      if (this.voskDebug) console.debug("ensureVoskModel: model initialized");
      return true;
    } catch (e) {
      console.warn("ensureVoskModel failed:", e);
      return false;
    }
  }

  async ensureMicPermission(): Promise<boolean> {
    try {
      if (this.haveMicPermission) return true;
      if (Platform.OS !== "android") {
        this.haveMicPermission = true;
        return true;
      }
      
      const checked = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      if (checked) {
        this.haveMicPermission = true;
        if (this.voskDebug)
          console.debug("ensureMicPermission: already granted");
        return true;
      }
      
      const perm = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Microphone Permission",
          message:
            "This app needs access to your microphone for speech recognition.",
          buttonPositive: "OK",
        }
      );
      
      if (perm === PermissionsAndroid.RESULTS.GRANTED) {
        this.haveMicPermission = true;
        return true;
      }
      return false;
    } catch (e) {
      console.warn("ensureMicPermission error:", e);
      return false;
    }
  }

  async startVoskChunk() {
    if (!this.isListening || !this.usingVosk) return;

    try {
      this.lastVoskFinal = null;
      this.voskPaused = false;

      this.onStatusUpdate?.("Recording...");

      try {
        (NativeModules as any).VoskSpeech.startListening();
      } catch (e) {
        console.warn("startVoskChunk: failed to start native listening:", e);
        return;
      }

      if (this.voskMaxListenTimer) {
        clearTimeout(this.voskMaxListenTimer);
        this.voskMaxListenTimer = null;
      }

      this.voskMaxListenTimer = setTimeout(async () => {
        this.voskPaused = true;
        try {
          (NativeModules as any).VoskSpeech.stopListening();
        } catch (e) {}

        if (this.lastVoskFinal && this.lastVoskFinal.trim() !== "") {
          this.processingCommand = true;
          this.onProcessingStateChange?.(true);
          this.onStatusUpdate?.("Processing...");

          try {
            if (this.processCommand) {
              await this.processCommand(this.lastVoskFinal || "");
            }
          } catch (e) {
            console.warn("startVoskChunk processing error:", e);
          } finally {
            this.processingCommand = false;
            this.onProcessingStateChange?.(false);
            this.lastVoskFinal = null;
          }
        } else {
          this.onStatusUpdate?.("No command detected.");
        }

        if (this.voskMaxListenTimer) {
          clearTimeout(this.voskMaxListenTimer);
          this.voskMaxListenTimer = null;
        }

        const waitForSpeechToFinish = async () => {
          const isSpeaking = await Speech.isSpeakingAsync();
          if (isSpeaking) {
            setTimeout(waitForSpeechToFinish, 100);
            return;
          }

          if (this.isListening && this.usingVosk) {
            this.onStatusUpdate?.("Listening (ready)");
            setTimeout(() => {
              if (this.isListening && this.usingVosk) {
                this.startVoskChunk();
              }
            }, 250);
          }
        };

        waitForSpeechToFinish();
      }, this.VOSK_CHUNK_MS);
    } catch (err) {
      console.warn("startVoskChunk error:", err);
    }
  }

  async initializeVosk(): Promise<boolean> {
    if (Platform.OS !== "android" || !(NativeModules as any).VoskSpeech) {
      return false;
    }

    try {
      if (this.voskDebug)
        console.debug("Vosk: native module detected, starting native path");

      const perm = await this.ensureMicPermission();
      if (!perm) {
        this.onError?.("Microphone permission required.");
        return false;
      }

      const okModel = await this.ensureVoskModel();
      if (!okModel) {
        this.onError?.(
          "Offline speech model failed to initialize. Please ensure the model is placed in android/app/src/main/assets/model/"
        );
        return false;
      }

      this.usingVosk = true;
      if (this.voskDebug)
        console.debug("Vosk: permission granted, subscribing to events");

      if (this.voskSubscription) {
        try {
          this.voskSubscription.remove();
        } catch {}
        this.voskSubscription = null;
      }

      this.voskSubscription = DeviceEventEmitter.addListener(
        "VoskSpeechResult",
        (payload: any) => {
          try {
            if (this.voskPaused) return;
            if (this.voskDebug)
              console.debug("Vosk event received:", payload);
            const text = payload && payload.text ? String(payload.text) : "";
            const isFinal = !!payload.final;
            if (!isFinal) {
              this.currentInterim = text;
            } else {
              this.currentInterim = "";
              if (text && text.trim() !== "") {
                this.lastVoskFinal = text;
                if (this.voskDebug)
                  console.debug("Buffered Vosk final:", this.lastVoskFinal);
              }
            }
            this.onResult?.(text);
          } catch (e) {
            console.warn("Vosk event handler error:", e);
          }
        }
      );

      if (this.voskErrorSubscription) {
        try {
          this.voskErrorSubscription.remove();
        } catch {}
        this.voskErrorSubscription = null;
      }
      this.voskErrorSubscription = DeviceEventEmitter.addListener(
        "VoskSpeechError",
        (payload: any) => {
          console.warn("VoskSpeechError event:", payload);
          this.onError?.(`Vosk error: ${payload?.error || "unknown"}`);
        }
      );

      if (this.voskPermissionSubscription) {
        try {
          this.voskPermissionSubscription.remove();
        } catch {}
        this.voskPermissionSubscription = null;
      }
      this.voskPermissionSubscription = DeviceEventEmitter.addListener(
        "VoskPermissionRequired",
        () => {
          console.warn("Vosk requested native permission (native check)");
          this.onError?.("Vosk requires RECORD_AUDIO permission.");
        }
      );

      return true;
    } catch (err) {
      console.error("Error initializing Vosk:", err);
      this.usingVosk = false;
      return false;
    }
  }

  stopListening(): void {
    this.voskPaused = false;
    this.lastVoskFinal = null;

    if (this.voskUtteranceTimer) {
      try {
        clearTimeout(this.voskUtteranceTimer);
      } catch (e) {}
      this.voskUtteranceTimer = null;
    }

    if (this.voskMaxListenTimer) {
      try {
        clearTimeout(this.voskMaxListenTimer);
      } catch (e) {}
      this.voskMaxListenTimer = null;
    }

    if (this.usingVosk) {
      try {
        try {
          (NativeModules as any).VoskSpeech.stopListening();
        } catch (e) {}
        if (this.voskSubscription) {
          try {
            this.voskSubscription.remove();
          } catch (e) {}
          this.voskSubscription = null;
        }
        if (this.voskErrorSubscription) {
          try {
            this.voskErrorSubscription.remove();
          } catch (e) {}
          this.voskErrorSubscription = null;
        }
        if (this.voskPermissionSubscription) {
          try {
            this.voskPermissionSubscription.remove();
          } catch (e) {}
          this.voskPermissionSubscription = null;
        }
      } catch (err) {
        console.warn("Error stopping Vosk native listener:", err);
      } finally {
        this.usingVosk = false;
        this.currentInterim = "";
      }
    }
  }

  isUsingVosk(): boolean {
    return this.usingVosk;
  }

  getLastFinalResult(): string | null {
    return this.lastVoskFinal;
  }

  setListeningState(isListening: boolean): void {
    this.isListening = isListening;
  }

  setPreventRecordingDuringSpeak(prevent: boolean): void {
    this.preventRecordingDuringSpeak = prevent;
  }

  isPreventingRecording(): boolean {
    return this.preventRecordingDuringSpeak;
  }
}