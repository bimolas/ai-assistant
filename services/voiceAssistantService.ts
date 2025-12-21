import * as Speech from "expo-speech";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import { appDetectionService } from "./appDetectionService";
import { Buffer } from "buffer";
import Constants from "expo-constants";
import { queryLLM } from "./llmService";

export interface VoiceCommand {
  command: string;
  description?: string;
  keywords: string[];
  action: () => Promise<void> | void;
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
  // When true, avoid starting recordings (used while TTS is playing)
  private preventRecordingDuringSpeak = false;
  // Common name -> package aliases to improve recognition of app names
  private APP_ALIASES: Record<string, string> = {
    youtube: "com.google.android.youtube",
    chrome: "com.android.chrome",
    google: "com.android.chrome",
    maps: "com.google.android.apps.maps",
    whatsapp: "com.whatsapp",
    instagram: "com.instagram.android",
    facebook: "com.facebook.katana",
    spotify: "com.spotify.music",
    gmail: "com.google.android.gm",
  };

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
        // Try to launch the native Settings app; speak only after we know the result.
        try {
          this.onStatusUpdate?.("Attempting to open Settings");
          const result = await appDetectionService.launchApp(
            "com.android.settings"
          );
          if (result.success) {
            await this.speak("Opening settings");
          } else {
            console.warn("Opening settings failed:", result.error);
            await this.speak("Unable to open settings automatically.");
            this.onStatusUpdate?.(result.error || "Unable to open settings");
          }
        } catch (err) {
          console.warn("Error launching settings:", err);
          await this.speak("Unable to open settings.");
          this.onStatusUpdate?.("Error launching settings");
        }
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
            // Speak a short, useful list (top 8) and provide a count
            const top = apps.slice(0, 8);
            const names = top.map((a) => a.appName).join(", ");
            await this.speak(
              `Found ${apps.length} applications. First ones: ${names}`
            );
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
      // Prevent the recorder from starting while we speak to avoid capturing TTS output
      this.preventRecordingDuringSpeak = true;

      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) await Speech.stop();

      // Start speaking
      Speech.speak(text, {
        language: "en",
        pitch: options?.pitch || 1.0,
        rate: options?.rate || 0.9,
      });

      // Wait until speaking finishes (or timeout)
      const start = Date.now();
      const timeoutMs = 30000; // max wait 30s
      while (true) {
        const speaking = await Speech.isSpeakingAsync();
        if (!speaking) break;
        if (Date.now() - start > timeoutMs) {
          console.warn("TTS speak() timeout reached");
          break;
        }
        // small delay
        await new Promise((r) => setTimeout(r, 120));
      }

      this.preventRecordingDuringSpeak = false;
      return;
    } catch (error) {
      this.preventRecordingDuringSpeak = false;
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

    // LLM trigger: if the user says the token '2b' anywhere in their utterance
    // (e.g. "hey 2b what's the weather"), treat the remainder after the token
    // as an LLM prompt and do not run normal command matching. We use a regex
    // so we are tolerant to noisy recognition and punctuation.
    const triggerMatch = normalizedCommand.match(/\b2b\b/);
    if (triggerMatch) {
      // Extract user text after the first occurrence of the token '2b' from
      // the original (non-normalized) text to preserve punctuation and casing.
      const userQuery = commandText.replace(/.*?\b2b\b[\s:,-]*/i, "").trim();
      if (!userQuery) {
        const msg = 'Please provide a question after "2b".';
        await this.speak(msg);
        return { success: false, message: msg };
      }

      try {
        // Prompt guidance aimed at keeping replies short, in the Unit 2B style,
        // and to attempt to infer intent when recognition is noisy. If the
        // intent is ambiguous, ask a single short clarifying question.
        const prompt = `User asked: "${userQuery}". You are Unit 2B from nier automata, a concise and helpful voice assistant. Reply briefly (one or two short sentences) in Unit 2B style from nier automata. If the audio appears noisy or the question is unclear, infer the most likely intent and answer succinctly; if you cannot safely infer intent, ask one short clarifying question. When giving documentation-like output, prefer Context7 formatting.`;

        const llmReply = await queryLLM(prompt).catch((e) => {
          console.warn("LLM query failed:", e);
          return null;
        });

        if (!llmReply) {
          const msg = "Unable to get a response from the assistant.";
          await this.speak(msg);
          return { success: false, message: msg };
        }

        await this.speak(llmReply);
        return { success: true, message: "LLM response delivered" };
      } catch (err) {
        console.error("LLM trigger error:", err);
        return { success: false, message: "LLM error" };
      }
    }

    // Check for app launch commands FIRST (before other commands)
    if (
      normalizedCommand.startsWith("open ") ||
      normalizedCommand.startsWith("launch ")
    ) {
      const appName = normalizedCommand.replace(/^(open|launch)\s+/, "").trim();
      if (appName) {
        const result = await this.handleAppLaunch(appName);
        return result;
      }
    }

    // Check for exact match
    if (this.commands.has(normalizedCommand)) {
      const command = this.commands.get(normalizedCommand)!;
      await command.action();
      return { success: true, message: "Command executed successfully" };
    }

    // Check for partial matches
    for (const [key, command] of this.commands.entries()) {
      if (normalizedCommand.includes(key) || key.includes(normalizedCommand)) {
        await command.action();
        return { success: true, message: "Command executed successfully" };
      }
    }

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

    // Fallback: allow voice commands like "open <app>" or "launch <app>" to open installed apps.
    const openMatch = normalizedCommand.match(/^(open|launch|start)\s+(.+)$/);
    if (openMatch) {
      const appQuery = openMatch[2].trim();
      try {
        // First check aliases for common short names (youtube -> com.google.android.youtube)
        // Normalize common phrases: collapse spaces and remove filler words
        const aliasKey = appQuery.toLowerCase().replace(/\s+/g, "");
        if (this.APP_ALIASES[aliasKey]) {
          const pkg = this.APP_ALIASES[aliasKey];
          await this.speak(`Opening ${appQuery}`);
          const launch = await appDetectionService.launchApp(pkg);
          if (!launch.success) {
            await this.speak(`Unable to open ${appQuery}`);
            return { success: false, message: launch.error || "Launch failed" };
          }
          return { success: true, message: `Launched ${appQuery}` };
        }

        // Otherwise use the generic handler which searches installed apps and launches
        const res = await this.handleAppLaunch(appQuery);
        return res;
      } catch (err: any) {
        console.error(
          "Error while trying to open app from voice command:",
          err
        );
        return {
          success: false,
          message: "An error occurred while trying to open the app.",
        };
      }
    }

    // As a fallback, ask the LLM for help (if configured).
    try {
      const prompt = `User said: "${commandText}". You are Unit 2B, a concise useful voice assistant. Reply briefly (one or two sentences). If the user intends to open an application, respond exactly with: OPEN_APP: <app name>. Otherwise give a short helpful answer.`;
      const llmReply = await queryLLM(prompt).catch((e) => {
        console.warn("LLM query failed:", e);
        return null;
      });

      if (!llmReply) {
        return { success: false, message: "Command not recognized" };
      }

      // If LLM instructs to open app in the exact format OPEN_APP: name, handle it
      const openMatch = llmReply.match(/^OPEN_APP:\s*(.+)$/i);
      if (openMatch) {
        const appName = openMatch[1].trim();
        const res = await this.handleAppLaunch(appName);
        return res;
      }

      // Otherwise speak the LLM reply (short response) and don't immediately restart recording until speech ends
      await this.speak(llmReply);
      return { success: true, message: "LLM response delivered" };
    } catch (err) {
      console.error("LLM fallback error:", err);
      return { success: false, message: "Command not recognized" };
    }
  }

  private async handleAppLaunch(
    appName: string
  ): Promise<{ success: boolean; message: string }> {
    if (!appName || appName.trim() === "") {
      const msg = "Please specify an application name";
      await this.speak(msg);
      return { success: false, message: msg };
    }

    await this.speak(`Searching for ${appName}`);
    const apps = await appDetectionService.getInstalledApps();

    if (apps.length === 0) {
      const msg = "No applications detected. Please check app permissions.";
      await this.speak(msg);
      return { success: false, message: msg };
    }

    const searchTerm = appName.toLowerCase().trim();

    // Try exact match first
    let matchingApp = apps.find(
      (app) => app.appName.toLowerCase() === searchTerm
    );

    // Try partial match in app name
    if (!matchingApp) {
      matchingApp = apps.find((app) =>
        app.appName.toLowerCase().includes(searchTerm)
      );
    }

    // Try partial match in package name
    if (!matchingApp) {
      matchingApp = apps.find((app) =>
        app.packageName.toLowerCase().includes(searchTerm)
      );
    }

    // Try fuzzy matching (words in app name)
    if (!matchingApp) {
      const searchWords = searchTerm.split(/\s+/);
      matchingApp = apps.find((app) => {
        const appNameLower = app.appName.toLowerCase();
        return searchWords.every((word) => appNameLower.includes(word));
      });
    }

    if (matchingApp) {
      // Speak immediately to acknowledge the request, then attempt launch.
      await this.speak(`Opening ${matchingApp.appName}`);
      const result = await appDetectionService.launchApp(
        matchingApp.packageName
      );
      if (!result.success) {
        const errorMsg = result.error || "Unable to launch application";
        const fullMsg = `Failed to launch ${matchingApp.appName}: ${errorMsg}`;
        await this.speak(`Failed to open ${matchingApp.appName}`);
        return { success: false, message: fullMsg };
      } else {
        const msg = `Successfully launched ${matchingApp.appName}`;
        // don't repeat too much when user switches apps; keep it short
        return { success: true, message: msg };
      }
    } else {
      // Find similar apps
      const similar = apps
        .filter((app) => {
          const appNameLower = app.appName.toLowerCase();
          return (
            appNameLower.includes(searchTerm.substring(0, 3)) ||
            searchTerm.includes(appNameLower.substring(0, 3))
          );
        })
        .slice(0, 3);

      if (similar.length > 0) {
        const suggestions = similar.map((app) => app.appName).join(", ");
        const msg = `Application "${appName}" not found. Did you mean: ${suggestions}?`;
        await this.speak(
          `Application ${appName} not found. Did you mean: ${suggestions}?`
        );
        return { success: false, message: msg };
      } else {
        const msg = `Application "${appName}" not found. Use "list apps" to see available applications.`;
        await this.speak(
          `Application ${appName} not found. Use "list apps" to see available applications.`
        );
        return { success: false, message: msg };
      }
    }
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

    // If we're currently speaking (or prevented), wait until speaking finishes
    if (this.preventRecordingDuringSpeak) {
      // wait up to 5s for speak to finish
      const start = Date.now();
      while (this.preventRecordingDuringSpeak && Date.now() - start < 5000) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 150));
      }
      if (this.preventRecordingDuringSpeak) return; // still speaking — skip starting
    }

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

      // Send audio to Deepgram using fetch (works reliably in RN/Expo).
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      // `buffer` is a Node-style Buffer (from 'buffer'). Convert to Uint8Array
      // Fetch accepts typed arrays as body in React Native/Expo.
      const uint8 = Uint8Array.from(buffer as any);

      const resp = await fetch(
        "https://api.deepgram.com/v1/listen?punctuate=true&language=en-US",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${process.env.DEEPGRAM_API_KEY || ""}`,
            "Content-Type": "audio/wav",
          },
          body: uint8,
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        console.error("Deepgram response error:", resp.status, text);
        return null;
      }

      const data = await resp.json();
      const alternatives = data?.results?.channels?.[0]?.alternatives || [];
      // Prefer the alternative with highest confidence when available, otherwise the first non-empty
      let transcript: string | null = null;
      if (alternatives.length > 0) {
        let best = alternatives[0];
        for (const alt of alternatives) {
          if (
            alt.confidence &&
            best.confidence &&
            alt.confidence > best.confidence
          ) {
            best = alt;
          }
        }
        transcript = best.transcript || null;
      }

      return transcript && transcript.trim() ? transcript : null;
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
