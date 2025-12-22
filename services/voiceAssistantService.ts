import * as Speech from "expo-speech";
import { Audio } from "expo-av";
import { Alert, Linking } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { appDetectionService } from "./appDetectionService";
import { Buffer } from "buffer";
import Constants from "expo-constants";
import { historyService } from "./historyService";
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
  // Prevent concurrent Recording.prepare/createAsync calls
  private preparingRecording = false;
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
    // Camera aliases — common vendor package names and short forms
    camera: "com.android.camera",
    cam: "com.android.camera",
    "camera app": "com.android.camera",
    "google camera": "com.google.android.camera",
    "samsung camera": "com.samsung.android.camera",
    "miui camera": "com.miui.camera",
    "huawei camera": "com.huawei.camera",
  };

  // Minimum confidence threshold for automatic recognition acceptance
  private MIN_RECOGNITION_CONFIDENCE = 0.5;

  // Minimum number of words to accept short transcriptions without a confidence check
  private MIN_WORDS_FOR_LOW_CONFIDENCE = 3;

  // Resolve Deepgram API key from env or Expo config; fallback placeholder
  private DEEPGRAM_API_KEY: string =
    process.env.DEEPGRAM_API_KEY ||
    (Constants?.expoConfig?.extra as any)?.DEEPGRAM_API_KEY ||
    "06169037265ad5ab922a0fb6aec0ecfc3827be3e";

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

    // Also register a shorter command 'app list' and accept 'application list'
    // for convenience and consistency with user phrasing.
    this.registerCommand({
      command: "app list",
      description: "Open the apps list screen (short)",
      keywords: [
        "app list",
        "apps",
        "list apps",
        "show apps",
        "application list",
      ],
      action: async () => {
        try {
          if (this.onNavigate) {
            try {
              this.onNavigate("Apps");
            } catch (e) {
              console.warn("onNavigate threw:", e);
            }
          }
          await this.speak("Opening application list");
        } catch (err) {
          console.error("Error opening app list:", err);
          await this.speak("Unable to open application list");
        }
      },
    });

    // Add an explicit 'open camera' command to improve recognition of camera
    // requests (some devices / recognizers struggle with 'camera' matching).
    this.registerCommand({
      command: "open camera",
      description: "Opens the device camera",
      keywords: ["open camera", "camera", "cam"],
      action: async () => {
        try {
          this.onStatusUpdate?.("Opening camera");
          const res = await appDetectionService.launchApp("com.android.camera");
          if (res.success) {
            await this.speak("Opening camera");
          } else {
            await this.speak("Unable to open camera");
          }
        } catch (err) {
          console.warn("Error opening camera:", err);
          await this.speak("Unable to open camera");
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
      // If we were listening before speaking, and no recording is active,
      // attempt to restart the recorder so the assistant resumes listening.
      try {
        if (this.isListening && !this.recording && !this.processingCommand) {
          // Small delay to let audio focus settle
          setTimeout(() => {
            // startRecording() is safe to call even if another start is scheduled
            // it will return early if recording is already active.
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            this.startRecording();
          }, 250);
        }
      } catch (e) {
        // swallow any errors — speak should not throw on restart attempts
        console.warn("Failed to auto-restart recording after speak:", e);
      }

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
          this.onStatusUpdate?.(msg);
          await this.speak(msg);
          return { success: false, message: msg };
        }

        // Update UI immediately, then speak asynchronously to reduce perceived latency
        this.onStatusUpdate?.(llmReply);
        this.speak(llmReply);
        try {
          // Record the user's question and the assistant response together
          await historyService.addWithResponse(
            userQuery || commandText,
            llmReply
          );
        } catch {}
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
      try {
        await historyService.add(command.command);
      } catch {}
      return { success: true, message: "Command executed successfully" };
    }

    // Check for partial matches
    for (const [key, command] of this.commands.entries()) {
      if (normalizedCommand.includes(key) || key.includes(normalizedCommand)) {
        await command.action();
        try {
          await historyService.add(command.command);
        } catch {}
        return { success: true, message: "Command executed successfully" };
      }
    }

    // Try keyword matching first - more lenient approach
    for (const [key, cmd] of this.commands.entries()) {
      for (const keyword of cmd.keywords) {
        if (normalizedCommand.includes(keyword)) {
          await cmd.action();
          try {
            await historyService.add(cmd.command);
          } catch {}
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
      try {
        await historyService.add(bestMatch.command.command);
      } catch {}
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
          this.onStatusUpdate?.(`Opening ${appQuery}`);
          this.speak(`Opening ${appQuery}`);
          const launch = await appDetectionService.launchApp(pkg);
          if (!launch.success) {
            await this.speak(`Unable to open ${appQuery}`);
            return { success: false, message: launch.error || "Launch failed" };
          }
          try {
            await historyService.add(`open ${appQuery}`);
          } catch {}
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

      // Otherwise update UI immediately then speak asynchronously
      this.onStatusUpdate?.(llmReply);
      this.speak(llmReply);
      try {
        // record the user's original command and the assistant reply
        await historyService.addWithResponse(commandText, llmReply);
      } catch {}
      return { success: true, message: "LLM response delivered" };
    } catch (err) {
      console.error("LLM fallback error:", err);
      return { success: false, message: "Command not recognized" };
    }
  }

  private async handleAppLaunch(appName: string): Promise<any> {
    if (!appName || appName.trim() === "") {
      const msg = "Please specify an application name";
      this.onStatusUpdate?.(msg);
      await this.speak(msg);
      return { success: false, message: msg };
    }
    this.onStatusUpdate?.(`Searching for ${appName}`);
    // Fire an acknowledgement TTS but don't block UI updates
    const apps = await appDetectionService.getInstalledApps();

    if (apps.length === 0) {
      const msg = "No applications detected. Please check app permissions.";
      await this.speak(msg);
      return { success: false, message: msg };
    }

    const searchTerm = appName.toLowerCase().trim();

    // Quick alias check: map common short names directly to package names
    const aliasKey = searchTerm.replace(/\s+/g, "");
    if (this.APP_ALIASES[aliasKey]) {
      const pkg = this.APP_ALIASES[aliasKey];
      this.onStatusUpdate?.(`Opening ${appName}`);
      this.speak(`Opening ${appName}`);
      const res = await appDetectionService.launchApp(pkg);
      if (res.success) {
        try {
          await historyService.add(`open ${appName}`);
        } catch {}
        return { success: true, message: `Launched ${appName}` };
      }
      // otherwise continue to try searching installed apps
    }

    // Also check individual words for aliases (e.g., 'camera' -> camera package)
    for (const w of searchTerm.split(/\s+/)) {
      if (this.APP_ALIASES[w]) {
        const pkg = this.APP_ALIASES[w];
        this.onStatusUpdate?.(`Opening ${appName}`);
        this.speak(`Opening ${appName}`);
        const res = await appDetectionService.launchApp(pkg);
        if (res.success) {
          try {
            await historyService.add(`open ${appName}`);
          } catch {}
          return { success: true, message: `Launched ${appName}` };
        }
      }
    }

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
      // Avoid launching Settings accidentally when the matched package is Settings
      const pkgLower = (matchingApp.packageName || "").toLowerCase();
      const askedSettings =
        searchTerm.includes("setting") || searchTerm.includes("settings");
      if (pkgLower.includes("settings") && !askedSettings) {
        // Skip this Settings match and continue to fuzzy/suggestions below
      } else {
        // Speak immediately to acknowledge the request, then attempt launch.
        this.onStatusUpdate?.(`Opening ${matchingApp.appName}`);
        this.speak(`Opening ${matchingApp.appName}`);
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
          try {
            await historyService.add(`open ${matchingApp.appName}`);
          } catch {}
          return { success: true, message: msg };
        }
      }
    } else {
      // Try a fuzzy best-match
      const { app: fuzzyApp, score } = this.findBestFuzzyApp(apps, searchTerm);
      // For camera-related queries we accept a lower threshold because
      // device camera app names vary widely and recognition can be noisy.
      const isCameraQuery = /\bcam|camera\b/.test(searchTerm);
      const threshold = isCameraQuery ? 0.5 : 0.6;
      if (fuzzyApp && score >= threshold) {
        // Accept fuzzy match
        this.onStatusUpdate?.(`Opening ${fuzzyApp.appName}`);
        this.speak(`Opening ${fuzzyApp.appName}`);
        const launchRes = await appDetectionService.launchApp(
          fuzzyApp.packageName
        );
        if (launchRes.success) {
          try {
            await historyService.add(`open ${fuzzyApp.appName}`);
          } catch {}
          return { success: true, message: `Launched ${fuzzyApp.appName}` };
        } else {
          await this.speak(`Unable to open ${fuzzyApp.appName}`);
          return {
            success: false,
            message: launchRes.error || "Launch failed",
          };
        }
      }

      // Provide suggestions based on simple substring matches for clarity
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
        this.onStatusUpdate?.(msg);
        await this.speak(
          `Application ${appName} not found. Did you mean: ${suggestions}?`
        );
        return { success: false, message: msg };
      } else {
        const msg = `Application "${appName}" not found. Use "list apps" to see available applications.`;
        this.onStatusUpdate?.(msg);
        await this.speak(
          `Application ${appName} not found. Use "list apps" to see available applications.`
        );
        return { success: false, message: msg };
      }
    }
  }

  // ---------------- RECORDING & RECOGNITION ----------------
  /**
   * Start listening for a voice command.
   * Ensures permissions, sets audio mode, and starts recording.
   * Robust to errors and always keeps state flags consistent.
   */
  async startListening(): Promise<boolean> {
    if (this.isListening || this.processingCommand) return false;
    try {
      const perm = await Audio.requestPermissionsAsync();
      const granted =
        (perm as any).granted ?? (perm as any).status === "granted";
      if (!granted) {
        await this.speak(
          "Microphone permission required. Please enable microphone access in app settings."
        );
        this.onStatusUpdate?.("Microphone permission required.");
        this.isListening = false;
        this.onListeningStateChange?.(false);
        // Offer user a quick way to open app settings so they can re-enable the mic
       
        
        return false;
      }
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
      await this.speak("Listening to your command.");
      this.onStatusUpdate?.("Listening to your command");
      await this.startRecording();
      return true;
    } catch (error) {
      console.error("Error starting listening:", error);
      this.isListening = false;
      this.onListeningStateChange?.(false);
      this.onStatusUpdate?.("Error starting voice recognition.");
      return false;
    }
  }

  /**
   * Stop listening and clean up recording state.
   * Always clears timers and recording references, even on error.
   */
  async stopListening(): Promise<void> {
    if (!this.isListening) return;
    this.isListening = false;
    this.onListeningStateChange?.(false);
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
      }
    } catch (err) {
      console.warn("Stop listening error:", err);
    } finally {
      this.recording = null;
      this.processingCommand = false;
      this.onStatusUpdate?.("Stop listening");
      await this.speak("Stop listening");
    }
  }

  /**
   * Start a new audio recording session.
   * Ensures no stale recording, waits for TTS to finish, and sets up timer.
   */
  private async startRecording() {
    if (!this.isListening || this.processingCommand) return;
    if (this.preventRecordingDuringSpeak) {
      const start = Date.now();
      while (this.preventRecordingDuringSpeak && Date.now() - start < 5000) {
        await new Promise((r) => setTimeout(r, 150));
      }
      if (this.preventRecordingDuringSpeak) return;
    }
    if (this.preparingRecording) return;
    this.preparingRecording = true;
    try {
      await this.cleanupRecording();
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      this.recording = recording;
      this.onStatusUpdate?.("Recording...");
      this.recordingTimer = setTimeout(async () => {
        await this.stopRecording();
      }, 5000);
    } catch (err) {
      console.error("Error starting recording:", err);
      this.isListening = false;
      this.onListeningStateChange?.(false);
      this.onStatusUpdate?.("An error occurred while starting to record.");
    } finally {
      this.preparingRecording = false;
    }
  }

  /**
   * Clean up any existing recording, stopping and unloading if needed.
   * Always clears the recording reference.
   */
  private async cleanupRecording() {
    if (this.recording) {
      try {
        const status = await this.recording.getStatusAsync();
        if (status.isRecording) {
          await this.recording.stopAndUnloadAsync();
        }
      } catch (err) {
        console.warn("Error stopping existing recording:", err);
      } finally {
        this.recording = null;
      }
    }
  }

  /**
   * Stop the current recording and process the audio.
   * Handles errors gracefully and always clears recording reference.
   */
  private async stopRecording() {
    if (!this.recording || !this.isListening) return;
    this.processingCommand = true;
    this.onStatusUpdate?.("Processing...");
    let uri: string | null = null;
    try {
      try {
        await this.recording.stopAndUnloadAsync();
      } catch (stopErr: any) {
        console.warn("Error stopping existing recording (ignored):", stopErr);
      }
      uri = this.recording.getURI();
    } catch (err) {
      console.error("Recording error:", err);
      this.onStatusUpdate?.("An error occurred while recording.");
    } finally {
      this.recording = null;
    }
    // Process the audio if we have a valid URI
    if (!uri) {
      this.onStatusUpdate?.("No audio detected.");
    } else {
      try {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (!fileInfo.exists || fileInfo.size < 2000) {
          this.onStatusUpdate?.("No command detected.");
        } else {
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
      } catch (err) {
        console.error("Audio file error:", err);
        this.onStatusUpdate?.("Audio file error.");
      }
    }
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
      const timeout = setTimeout(() => controller.abort(), 20000);

      // `buffer` is a Node-style Buffer (from 'buffer'). Convert to Uint8Array
      // Fetch accepts typed arrays as body in React Native/Expo.
      const uint8 = Uint8Array.from(buffer as any);

      // Helper: pick best transcript from alternatives using confidence
      // and favor slightly longer transcripts when confidence is close.
      const selectTranscript = (
        alternatives: any[],
        minConf: number,
        minWords: number
      ) => {
        if (!alternatives || alternatives.length === 0) return null;
        let best: any = alternatives[0];
        let bestScore = -Infinity;
        for (const alt of alternatives) {
          const t = (alt.transcript || "").trim();
          const words = t ? t.split(/\s+/).filter(Boolean).length : 0;
          const conf = typeof alt.confidence === "number" ? alt.confidence : 0;
          // Score favors confidence first, but prefers longer transcripts when
          // confidences are close to avoid very short low-info picks.
          const score = conf * (1 + Math.log(1 + words) / 5) + words * 0.001;
          if (score > bestScore) {
            bestScore = score;
            best = alt;
          }
        }
        const transcript = best.transcript || null;
        if (!transcript) return null;
        const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
        const confVal =
          typeof best.confidence === "number" ? best.confidence : 0;
        if (confVal < minConf && wordCount < minWords) {
          // low confidence and very short -> reject
          console.warn("Low-confidence short recognition ignored", {
            transcript,
            conf: confVal,
          });
          return null;
        }
        return transcript && transcript.trim() ? transcript : null;
      };

      const resp = await fetch(
        "https://api.deepgram.com/v1/listen?punctuate=true&language=en-US",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${this.DEEPGRAM_API_KEY}`,
            "Content-Type": "audio/wav",
          },
          body: uint8,
          signal: controller.signal,
        }
      );

      clearTimeout(timeout);

      // Retry once when the request fails (network flakiness)
      if (!resp.ok) {
        const text = await resp.text().catch(() => "");
        console.warn(
          "Deepgram response error, retrying once:",
          resp.status,
          text
        );
        // retry once
        const resp2 = await fetch(
          "https://api.deepgram.com/v1/listen?punctuate=true&language=en-US",
          {
            method: "POST",
            headers: {
              Authorization: `Token ${this.DEEPGRAM_API_KEY}`,
              "Content-Type": "audio/wav",
            },
            body: uint8,
            signal: controller.signal,
          }
        ).catch(() => null as any);
        if (!resp2 || !resp2.ok) {
          const t2 = resp2 ? await resp2.text().catch(() => "") : "";
          console.error("Deepgram retry failed:", resp2?.status, t2);
          return null;
        }
        const data2 = await resp2.json().catch(() => null);
        const alternatives2 = data2?.results?.channels?.[0]?.alternatives || [];
        return selectTranscript(
          alternatives2,
          this.MIN_RECOGNITION_CONFIDENCE,
          this.MIN_WORDS_FOR_LOW_CONFIDENCE
        );
      }

      const data = await resp.json();
      const alternatives = data?.results?.channels?.[0]?.alternatives || [];
      return selectTranscript(
        alternatives,
        this.MIN_RECOGNITION_CONFIDENCE,
        this.MIN_WORDS_FOR_LOW_CONFIDENCE
      );
    } catch (err) {
      console.error("Deepgram recognition error:", err);
      return null;
    }
  }

  // ----------------- FUZZY MATCH HELPERS -----------------
  private levenshtein(a: string, b: string): number {
    const al = a.length;
    const bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    const matrix: number[][] = Array.from({ length: al + 1 }, () =>
      Array(bl + 1).fill(0)
    );
    for (let i = 0; i <= al; i++) matrix[i][0] = i;
    for (let j = 0; j <= bl; j++) matrix[0][j] = j;
    for (let i = 1; i <= al; i++) {
      for (let j = 1; j <= bl; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[al][bl];
  }

  private findBestFuzzyApp(
    apps: { appName: string; packageName: string }[],
    query: string
  ): { app: any | null; score: number } {
    const q = query.toLowerCase().trim();
    let best: any | null = null;
    let bestScore = 0;
    for (const app of apps) {
      const name = app.appName.toLowerCase();
      const pkg = app.packageName.toLowerCase();
      const maxLen = Math.max(name.length, q.length, 1);
      const d = this.levenshtein(name, q);
      const scoreName = 1 - d / maxLen; // normalized similarity

      // also check prefix similarity for short queries
      const prefixScore = name.startsWith(q) || pkg.startsWith(q) ? 1 : 0;

      const score = Math.max(scoreName, prefixScore);
      if (score > bestScore) {
        bestScore = score;
        best = app;
      }
    }
    return { app: best, score: bestScore };
  }

  public onStatusUpdate?: (message: string) => void;
  public onListeningStateChange?: (listening: boolean) => void;
  public onProcessingStateChange?: (processing: boolean) => void;
  // Optional navigation callback (App can set this to allow opening screens)
  public onNavigate?: (route: string) => void;

  // Routes where continuous listening is allowed. Callers can override.
  public allowedListeningRoutes: string[] = [
    "VoiceAssistant",
    "Voice",
    "VoiceScreen",
  ];

  /**
   * Notify the assistant that the app navigated to a new route.
   * If the new route is not in `allowedListeningRoutes` the assistant
   * will stop listening to avoid background recording conflicts.
   */
  public notifyNavigation(route: string) {
    try {
      const normalized = (route || "").toString();
      if (
        !this.allowedListeningRoutes.includes(normalized) &&
        this.isListening
      ) {
        // Stop listening when leaving the voice UI to avoid broken recordings
        // and audio focus conflicts.
        // We don't await here to avoid blocking the caller.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.stopListening();
      }
    } catch (e) {
      console.warn("notifyNavigation error:", e);
    }
  }

  /**
   * Replace the set of routes where continuous listening is allowed.
   */
  public setAllowedListeningRoutes(routes: string[]) {
    this.allowedListeningRoutes = Array.isArray(routes)
      ? routes
      : this.allowedListeningRoutes;
  }

  getAvailableCommands(): VoiceCommand[] {
    return Array.from(this.commands.values());
  }

  isCurrentlyListening(): boolean {
    return this.isListening;
  }
}

export const voiceAssistantService = VoiceAssistantService.getInstance();
