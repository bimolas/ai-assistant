import * as Speech from "expo-speech";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { appDetectionService } from "./appDetectionService";
import axios from "axios";
import { Buffer } from "buffer";
import { DEEPGRAM_API_KEY } from "@env";

export interface VoiceCommand {
  command: string;
  action: () => Promise<void> | void;
  description: string;
  keywords: string[];
}

export interface CommandResult {
  success: boolean;
  message?: string;
}

class VoiceAssistantService {
  private static instance: VoiceAssistantService;
  private isListening = false;
  private recording: Audio.Recording | null = null;
  private commands: Map<string, VoiceCommand> = new Map();
  private processingCommand = false;
  private recordingTimer: NodeJS.Timeout | null = null;
  private audioModeSet = false;

  static getInstance(): VoiceAssistantService {
    if (!VoiceAssistantService.instance) {
      VoiceAssistantService.instance = new VoiceAssistantService();
      VoiceAssistantService.instance.initializeCommands();
    }
    return VoiceAssistantService.instance;
  }

  private initializeCommands() {
    // System commands with keywords for better matching
    this.registerCommand({
      command: "open settings",
      description: "Opens device settings",
      keywords: ["open", "settings"],
      action: async () => {
        await this.speak("Opening settings");
        // Use expo-intent-launcher if needed
      },
    });

    this.registerCommand({
      command: "what time is it",
      description: "Tells the current time",
      keywords: ["time"],
      action: async () => {
        const now = new Date();
        await this.speak(`The time is ${now.toLocaleTimeString()}`);
      },
    });

    this.registerCommand({
      command: "what day is it",
      description: "Tells the current date",
      keywords: ["day", "date", "today"],
      action: async () => {
        const now = new Date();
        await this.speak(`Today is ${now.toLocaleDateString()}`);
      },
    });

    this.registerCommand({
      command: "list apps",
      description: "Lists installed apps",
      keywords: ["list", "apps", "applications"],
      action: async () => {
        try {
          const apps = await appDetectionService.getInstalledApps();
          if (apps.length === 0) {
            await this.speak("No applications detected.");
          } else {
            await this.speak(`Found ${apps.length} applications`);
          }
        } catch (error) {
          console.error("Error detecting apps:", error);
          await this.speak("Unable to detect applications.");
        }
      },
    });

    this.registerCommand({
      command: "hello",
      description: "Greets the user",
      keywords: ["hello", "hi"],
      action: async () => {
        await this.speak("Hello. Unit 2B at your service.");
      },
    });

    this.registerCommand({
      command: "status",
      description: "Reports system status",
      keywords: ["status"],
      action: async () => {
        await this.speak(
          "All systems operational. Unit 2B ready for commands."
        );
      },
    });
  }

  registerCommand(command: VoiceCommand) {
    this.commands.set(command.command.toLowerCase(), command);
  }

  async speak(
    text: string,
    options?: { rate?: number; pitch?: number }
  ): Promise<void> {
    try {
      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) await Speech.stop();

      return Speech.speak(text, {
        language: "en",
        pitch: options?.pitch || 1.0,
        rate: options?.rate || 0.9,
      });
    } catch (error) {
      console.error("Error speaking:", error);
    }
  }

  async stopSpeaking(): Promise<void> {
    try {
      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) await Speech.stop();
    } catch (error) {
      console.error("Error stopping speech:", error);
    }
  }

  async processCommand(commandText: string): Promise<CommandResult> {
    const normalizedCommand = commandText
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .trim();

    // Try keyword matching first - more lenient approach
    for (const [key, cmd] of this.commands.entries()) {
      for (const keyword of cmd.keywords) {
        if (normalizedCommand.includes(keyword)) {
          await cmd.action();
          return { success: true, message: `Command executed: ${cmd.command}` };
        }
      }
    }

    // Try exact match
    const command = this.commands.get(normalizedCommand);
    if (command) {
      await command.action();
      return { success: true, message: `Command executed: ${command.command}` };
    }

    // Try fuzzy match: compare word overlap
    let bestMatch: { command: VoiceCommand; score: number } | null = null;
    const inputWords = normalizedCommand.split(/\s+/);

    for (const [key, cmd] of this.commands.entries()) {
      const keyWords = key.split(/\s+/);
      const matchCount = keyWords.filter((w) => inputWords.includes(w)).length;
      const score = matchCount / keyWords.length;

      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { command: cmd, score };
      }
    }

    if (bestMatch && bestMatch.score >= 0.5) {
      await bestMatch.command.action();
      return {
        success: true,
        message: `Command executed: ${bestMatch.command.command}`,
      };
    }

    return { success: false, message: "Command not recognized" };
  }

  // ---------------- RECORDING & RECOGNITION ----------------
  async startListening(): Promise<boolean> {
    if (this.isListening || this.processingCommand) return false;

    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        await this.speak("Microphone permission required. Access denied.");
        this.onStatusUpdate?.("Microphone permission required.");
        return false;
      }

      // Only set audio mode once
      if (!this.audioModeSet) {
        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          playThroughEarpieceAndroid: false,
        });
        this.audioModeSet = true;
      }

      this.isListening = true;
      this.onListeningStateChange?.(true);

      // Voice feedback
      await this.speak("Listening to your command.");
      this.onStatusUpdate?.("Listening to your command");

      // Start recording
      await this.startRecording();

      return true;
    } catch (error) {
      console.error("Error starting listening:", error);
      this.onStatusUpdate?.("Error starting voice recognition.");
      this.isListening = false;
      this.onListeningStateChange?.(false);
      return false;
    }
  }

  async stopListening(): Promise<void> {
    if (!this.isListening) return;

    this.isListening = false;
    this.onListeningStateChange?.(false);

    // Clear any timers
    if (this.recordingTimer) {
      clearTimeout(this.recordingTimer);
      this.recordingTimer = null;
    }

    try {
      if (this.recording) {
        const status = await this.recording.getStatusAsync();
        if (status.isRecording) {
          await this.recording.stopAndUnloadAsync();
        }
        this.recording = null;
      }
    } catch (err) {
      console.warn("Stop listening error:", err);
    }

    this.processingCommand = false;
    this.onStatusUpdate?.("Stop listening");
    await this.speak("Stop listening");
  }

  private async startRecording() {
    if (!this.isListening || this.processingCommand) return;

    try {
      // Make sure we don't have an existing recording
      if (this.recording) {
        try {
          const status = await this.recording.getStatusAsync();
          if (status.isRecording) {
            await this.recording.stopAndUnloadAsync();
          }
        } catch (err) {
          console.warn("Error stopping existing recording:", err);
        }
        this.recording = null;
      }

      // Create a new recording
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      this.recording = recording;

      this.onStatusUpdate?.("Recording...");

      // Set a timer to automatically stop recording after 5 seconds
      this.recordingTimer = setTimeout(async () => {
        await this.stopRecording();
      }, 5000);
    } catch (err) {
      console.error("Error starting recording:", err);
      this.onStatusUpdate?.("An error occurred while starting to record.");
      this.isListening = false;
      this.onListeningStateChange?.(false);
    }
  }

  private async stopRecording() {
    if (!this.recording || !this.isListening) return;

    this.processingCommand = true;
    this.onStatusUpdate?.("Processing...");

    try {
      // Stop the recording
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.recording = null;

      if (!uri) {
        this.onStatusUpdate?.("No audio detected.");
      } else {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (!fileInfo.exists || fileInfo.size < 2000) {
          // Too short → likely silence
          this.onStatusUpdate?.("No command detected.");
        } else {
          // Process the audio
          const transcript = await this.recognizeAudio(uri);
          if (!transcript || transcript.trim() === "") {
            this.onStatusUpdate?.("Could not recognize speech.");
          } else {
            const result = await this.processCommand(transcript);
            if (!result.success) {
              this.onStatusUpdate?.(
                result.message || "Command not recognized."
              );
            }
          }
        }
      }
    } catch (err) {
      console.error("Recording error:", err);
      this.onStatusUpdate?.("An error occurred while recording.");
    } finally {
      this.processingCommand = false;

      // If still listening, restart the recording process
      if (this.isListening) {
        setTimeout(() => {
          if (this.isListening) {
            this.startRecording();
          }
        }, 1000);
      }
    }
  }

  private async recognizeAudio(uri: string): Promise<string | null> {
    try {
      // Read file as base64
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to Buffer
      const buffer = Buffer.from(base64, "base64");

      // Send audio to Deepgram
      const response = await axios.post(
        "https://api.deepgram.com/v1/listen?punctuate=true&language=en-US",
        buffer,
        {
          headers: {
            Authorization: `Token ${DEEPGRAM_API_KEY}`,
            "Content-Type": "audio/wav",
          },
          timeout: 5000,
        }
      );

      const transcript =
        response.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript;

      return transcript || null;
    } catch (err) {
      console.error("Deepgram recognition error:", err);
      return null;
    }
  }

  public onStatusUpdate?: (message: string) => void;
  public onListeningStateChange?: (listening: boolean) => void;
  public onProcessingStateChange?: (processing: boolean) => void;

  getAvailableCommands(): VoiceCommand[] {
    return Array.from(this.commands.values());
  }

  isCurrentlyListening(): boolean {
    return this.isListening;
  }
}

export const voiceAssistantService = VoiceAssistantService.getInstance();
