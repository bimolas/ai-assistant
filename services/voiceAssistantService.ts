import * as Speech from "expo-speech";
import { Audio } from "expo-av";
import { appDetectionService } from "./appDetectionService";
import { SpeechRecognitionService } from "./SpeechRecognitionService";
import { TextToSpeechService } from "./TextToSpeechService";
import { LocationService } from "./LocationService";
import { CommandProcessorService, VoiceCommand, CommandResult } from "./CommandProcessorService";
import { AppLauncherService } from "./AppLauncherService";
import { AudioRecordingService } from "./AudioRecordingService";
import { Platform } from "react-native";

class VoiceAssistantService {
  private static instance: VoiceAssistantService;
  private isListening = false;
  private processingCommand = false;
  
  private speechRecognitionService: SpeechRecognitionService;
  private textToSpeechService: TextToSpeechService;
  private locationService: LocationService;
  private commandProcessorService: CommandProcessorService;
  private appLauncherService: AppLauncherService;
  private audioRecordingService: AudioRecordingService;
  
  public onStatusUpdate?: (message: string) => void;
  public onListeningStateChange?: (listening: boolean) => void;
  public onProcessingStateChange?: (processing: boolean) => void;
  public onNavigate?: (route: string) => void;

  public allowedListeningRoutes: string[] = [
    "VoiceAssistant",
    "Voice",
    "VoiceScreen",
  ];

  private constructor() {
    this.speechRecognitionService = new SpeechRecognitionService(
      (text) => {}, 
      (error) => this.emitStatus(error),
      (message) => this.emitStatus(message),
      (processing) => this.setProcessingState(processing),
      (listening) => this.setListeningState(listening),
      (text) => this.processCommand(text), 
      (text) => this.speak(text) 
    );
    
    this.textToSpeechService = new TextToSpeechService();
    
    this.locationService = new LocationService(
      (message) => this.emitStatus(message),
      (text) => this.speak(text)
    );
    
    this.commandProcessorService = new CommandProcessorService(
      (text) => this.speak(text),
      (message) => this.emitStatus(message),
      (route) => this.onNavigate?.(route)
    );
    
    this.appLauncherService = new AppLauncherService(
      (text) => this.speak(text),
      (message) => this.emitStatus(message)
    );
    
    this.audioRecordingService = new AudioRecordingService(
      (message) => this.emitStatus(message),
      (uri) => this.handleRecordingComplete(uri),
      () => this.restartRecording() 
    );
    
    this.initializeCommands();
  }

  static getInstance(): VoiceAssistantService {
    if (!VoiceAssistantService.instance) {
      VoiceAssistantService.instance = new VoiceAssistantService();
    }
    return VoiceAssistantService.instance;
  }

  private initializeCommands() {
    this.commandProcessorService.registerCommand({
      command: "where am I",
      description: "Tells your current location",
      keywords: [
        "where am i",
        "my location",
        "where are we",
        "location",
        "current location",
      ],
      action: async () => {
        await this.locationService.handleWhereAmI();
      },
    });

    this.commandProcessorService.registerCommand({
      command: "open settings",
      description: "Opens device settings",
      keywords: ["open", "settings"],
      action: async () => {
        try {
          this.emitStatus("Attempting to open Settings");
          const result = await appDetectionService.launchApp(
            "com.android.settings"
          );
          if (result.success) {
            await this.speak("Opening settings");
          } else {
            console.warn("Opening settings failed:", result.error);
            await this.speak("Unable to open settings automatically.");
            this.emitStatus(result.error || "Unable to open settings");
          }
        } catch (err) {
          console.warn("Error launching settings:", err);
          await this.speak("Unable to open settings.");
          this.emitStatus("Error launching settings");
        }
      },
    });

    this.commandProcessorService.registerCommand({
      command: "list apps",
      description: "Lists installed apps",
      keywords: ["list", "apps", "applications"],
      action: async () => {
        try {
          const apps = await appDetectionService.getInstalledApps();
          if (apps.length === 0) {
            await this.speak("No applications detected.");
          } else {
            const top = apps.slice(0, 8);
            const names = top.map((a) => a.appName).join(", ");
            await this.speak(`Found ${apps.length} applications.`);
          }
        } catch (error) {
          console.error("Error detecting apps:", error);
          await this.speak("Unable to detect applications.");
        }
      },
    });

    this.commandProcessorService.registerCommand({
      command: "open camera",
      description: "Opens the device camera",
      keywords: ["open camera", "camera", "cam"],
      action: async () => {
        const result = await this.appLauncherService.handleAppLaunch("camera");
        if (!result.success) {
          await this.speak(result.message || "Unable to open camera");
        }
      },
    });
  }

  private async handleRecordingComplete(uri: string): Promise<void> {
   
  }

  private async restartRecording(): Promise<void> {
    const waitForSpeechToFinish = async () => {
      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) {
        setTimeout(waitForSpeechToFinish, 100);
        return;
      }

      if (this.isListening) {
        setTimeout(() => {
          if (this.isListening) {
            this.emitStatus("Listening to your command");
            this.audioRecordingService.startRecording();
          }
        }, 1000);
      }
    };

    waitForSpeechToFinish();
  }

  async speak(
    text: string,
    options?: { rate?: number; pitch?: number }
  ): Promise<void> {
    this.speechRecognitionService.setPreventRecordingDuringSpeak(true);
    
    try {
      await this.textToSpeechService.speak(text, options);
    } finally {
      this.speechRecognitionService.setPreventRecordingDuringSpeak(false);
    }
  }

  async stopSpeaking(): Promise<void> {
    return this.textToSpeechService.stopSpeaking();
  }

  async processCommand(commandText: string): Promise<CommandResult> {
    const normalizedCommand = commandText
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .trim();
    
    if (
      normalizedCommand.startsWith("open ") ||
      normalizedCommand.startsWith("launch ")
    ) {
      const appName = normalizedCommand.replace(/^(open|launch)\s+/, "").trim();
      if (appName) {
        const result = await this.appLauncherService.handleAppLaunch(appName);
        return result;
      }
    }
    
    const result = await this.commandProcessorService.processCommand(commandText);
    
    if (result.message && result.message.includes("App launch requested:")) {
      const appName = result.message.replace("App launch requested: ", "");
      const launchResult = await this.appLauncherService.handleAppLaunch(appName);
      return launchResult;
    }
    
    return result;
  }

  async startListening(): Promise<boolean> {
    if (this.isListening || this.processingCommand) return false;

    const voskInitialized = await this.speechRecognitionService.initializeVosk();
    
    if (voskInitialized) {
      this.isListening = true;
      this.setListeningState(true);
      this.speechRecognitionService.setListeningState(true);
      this.emitStatus("Listening (offline)");
      
      await this.speak("Listening to your command.");
      
      this.speechRecognitionService.startVoskChunk();
      return true;
    } else {
      try {
        if (Platform.OS === "ios") {
          const perm = await Audio.requestPermissionsAsync();
          const granted =
            (perm as any).granted ?? (perm as any).status === "granted";
          if (!granted) {
            await this.speak(
              "Microphone permission required. Please enable microphone access in app settings."
            );
            this.emitStatus("Microphone permission required.");
            return false;
          }
        }

        await this.audioRecordingService.initializeAudioMode();
        
        this.isListening = true;
        this.setListeningState(true);

        await this.speak("Listening to your command.");
        this.emitStatus("Listening to your command");

        await this.audioRecordingService.startRecording();
        return true;
      } catch (error) {
        console.error("Error starting listening:", error);
        this.isListening = false;
        this.setListeningState(false);
        this.emitStatus("Error starting voice recognition.");
        return false;
      }
    }
  }

  async stopListening(): Promise<void> {
    if (!this.isListening) return;

    this.isListening = false;
    this.setListeningState(false);
    this.speechRecognitionService.setListeningState(false);

    this.speechRecognitionService.stopListening();
    
    this.audioRecordingService.setListeningState(false);
    await this.audioRecordingService.stopRecording();
    
    this.emitStatus("Stop listening");
    await this.speak("Stop listening");
  }

  private emitStatus(message: string) {
    try {
      console.debug("VoiceAssistantService: status ->", message);
      this.onStatusUpdate?.(message);
    } catch (e) {
      console.error("onStatusUpdate handler threw:", e);
    }
  }

  private setListeningState(listening: boolean) {
    try {
      console.debug("VoiceAssistantService: listening ->", listening);
      this.onListeningStateChange?.(listening);
    } catch (e) {
      console.error("onListeningStateChange handler threw:", e);
    }
  }

  private setProcessingState(processing: boolean) {
    try {
      console.debug("VoiceAssistantService: processing ->", processing);
      this.onProcessingStateChange?.(processing);
    } catch (e) {
      console.error("onProcessingStateChange handler threw:", e);
    }
  }

  public notifyNavigation(route: string) {
    try {
      const normalized = (route || "").toString();
      if (
        !this.allowedListeningRoutes.includes(normalized) &&
        this.isListening
      ) {
       
        this.stopListening();
      }
    } catch (e) {
      console.warn("notifyNavigation error:", e);
    }
  }

  public setAllowedListeningRoutes(routes: string[]) {
    this.allowedListeningRoutes = Array.isArray(routes)
      ? routes
      : this.allowedListeningRoutes;
  }

  getAvailableCommands(): VoiceCommand[] {
    return this.commandProcessorService.getAvailableCommands();
  }

  isCurrentlyListening(): boolean {
    return this.isListening;
  }
}

export const voiceAssistantService = VoiceAssistantService.getInstance();