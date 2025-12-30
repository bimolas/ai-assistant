import * as Speech from "expo-speech";
import { Audio } from "expo-av";
import {
  Alert,
  Linking,
  DeviceEventEmitter,
  NativeModules,
  PermissionsAndroid,
  Platform,
} from "react-native";
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
  /**
   * Handles the "where am I" voice command: requests location permission, gets location, reverse-geocodes, and speaks the result.
   */
  /**
   * Handles the "where am I" voice command: requests location permission, gets location, reverse-geocodes, and speaks the result.
   * Always returns a readable address string using the best available fields.
   * Emits the raw JSON response for debugging if the address is incomplete.
   */
  private async handleWhereAmI(): Promise<string | void> {
    this.setProcessingState(true);
    this.emitStatus("Processing location...");
    let finalAddress = "";
    try {
      // Use expo-location for permission and location
      let Location: typeof import("expo-location");
      try {
        Location = require("expo-location");
      } catch (e) {
        await this.speak("Location services are not available on this device.");
        this.setProcessingState(false);
        this.setListeningState(true);
        return;
      }

      // Request foreground location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        await this.speak(
          "I need location permission to tell you where you are."
        );
        this.setProcessingState(false);
        this.setListeningState(true);
        return;
      }

      // Get current position
      let coords;
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        coords = loc.coords;
      } catch (e) {
        await this.speak("I couldn't determine your current location.");
        this.setProcessingState(false);
        this.setListeningState(true);
        return;
      }

      // Reverse geocode using OpenStreetMap Nominatim
      try {
        const lat = coords.latitude;
        const lon = coords.longitude;
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
        const axios = require("axios");
        let response;
        try {
          response = await axios.get(url, {
            headers: {
              "User-Agent": "YoRHa2B/1.0 (samielmourtazak@gmail.com)",
            },
            validateStatus: () => true, // Always resolve, handle status manually
          });
        } catch (err) {
          this.emitStatus(
            `Network error: ${err && err.message ? err.message : err}`
          );
          await this.speak("I could not reach the location service.");
          return;
        }

        if (response.status === 403) {
          this.emitStatus(
            "Nominatim API returned 403 Forbidden. You may be rate-limited or missing a required User-Agent header. Try again later."
          );
          await this.speak(
            "Location service is temporarily unavailable due to rate limits. Please try again later."
          );
          return;
        }
        if (response.status !== 200) {
          this.emitStatus(
            `Geocoding failed with status ${response.status}: ${response.statusText}`
          );
          await this.speak(
            "I could not determine your address due to a service error."
          );
          return;
        }

        const address = response.data.address;
        // Fallback to display_name if address is missing
        if (!address) {
          if (response.data.display_name) {
            finalAddress = response.data.display_name;
            await this.speak(`You are at ${finalAddress}.`);
            this.emitStatus(`You are at ${finalAddress}.`);
            try {
              await historyService.addWithResponse("where am I", finalAddress);
            } catch {}
            return finalAddress;
          } else {
            await this.speak("I could not determine your address.");
            this.emitStatus("No address found in geocoding response.");
            return;
          }
        }

        // Extract fields with multiple fallbacks
        const getField = (...fields: string[]) => {
          for (const f of fields) {
            if (address[f]) return address[f];
          }
          return "";
        };

        const road = getField("road", "cycleway", "pedestrian", "footway");
        const city = getField("city", "town", "village");
        const suburb = getField("suburb", "neighbourhood");
        const state = address.state || "";
        const country = address.country || "";
        const postcode = address.postcode || "";

        // Compose address parts, skipping missing fields
        let parts: string[] = [];
        if (road) parts.push(road);
        if (suburb) parts.push(suburb);
        if (city) parts.push(city);
        if (state) parts.push(state);
        if (postcode) parts.push(postcode);
        if (country) parts.push(country);

        // If nothing found, fallback to display_name
        if (parts.length === 0 && response.data.display_name) {
          finalAddress = response.data.display_name;
          await this.speak(`You are at ${finalAddress}.`);
          this.emitStatus(`You are at ${finalAddress}.`);
          try {
            await historyService.addWithResponse("where am I", finalAddress);
          } catch {}
          return finalAddress;
        }

        // Compose readable string
        finalAddress = parts.join(", ");
        if (finalAddress) {
          const responseText = `You are at ${finalAddress}.`;
          await this.speak(responseText);
          this.emitStatus(responseText);
          try {
            await historyService.addWithResponse("where am I", responseText);
          } catch {}
        } else {
          // If still nothing, emit raw JSON for debugging
          const debugMsg = `Unable to construct address. Raw: ${JSON.stringify(
            response.data
          )}`;
          this.emitStatus(debugMsg);
          await this.speak("I could not determine your address.");
        }
        return finalAddress;
      } catch (e) {
        // If we have coordinates but can't describe the address, emit raw JSON
        if (coords) {
          this.emitStatus(
            `Reverse geocoding failed. ${e && e.message ? e.message : e}`
          );
          await this.speak(
            "I know where you are, but I can’t describe the address."
          );
        } else {
          await this.speak("I can’t access your location.");
        }
      }
    } catch (e) {
      await this.speak("I couldn't determine your current location.");
    } finally {
      this.setProcessingState(false);
      this.setListeningState(true);
    }
    return finalAddress;
  }
  private static instance: VoiceAssistantService;
  private isListening = false;
  private recording: Audio.Recording | null = null;
  private commands: Map<string, VoiceCommand> = new Map();
  private processingCommand = false;
  private recordingTimer: NodeJS.Timeout | null = null;
  private audioModeSet = false;
  // Vosk native module integration
  private voskEventEmitter: any = null;
  private voskSubscription: any = null;
  private voskErrorSubscription: any = null;
  private voskPermissionSubscription: any = null;
  private voskModelInitialized: boolean = false;
  private lastVoskFinal: string | null = null;
  private voskUtteranceTimer: any = null;
  private voskMaxListenTimer: any = null;
  private voskPaused = false;
  private VOSK_UTTERANCE_TIMEOUT_MS = 1200;
  private VOSK_CHUNK_MS = 5000;
  private haveMicPermission: boolean = false;
  private usingVosk = false;
  private currentInterim = "";
  // Enable verbose Vosk debug logs
  private voskDebug = true;
  // Public callbacks
  public onStatusUpdate?: (message: string) => void;
  public onListeningStateChange?: (listening: boolean) => void;
  public onProcessingStateChange?: (processing: boolean) => void;

  // Google Maps API key (from config, not hardcoded)
  private GOOGLE_MAPS_API_KEY: string =
    process.env.GOOGLE_MAPS_API_KEY ||
    (Constants?.expoConfig?.extra as any)?.GOOGLE_MAPS_API_KEY ||
    "";
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

  // Safe emitters that wrap user-provided callbacks with try/catch and logging
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

  static getInstance(): VoiceAssistantService {
    if (!VoiceAssistantService.instance) {
      VoiceAssistantService.instance = new VoiceAssistantService();
      VoiceAssistantService.instance.initializeCommands();
    }
    return VoiceAssistantService.instance;
  }

 
  private async startVoskChunk() {
    if (!this.isListening || !this.usingVosk) return;

    try {
      this.lastVoskFinal = null;
      this.voskPaused = false;

      this.emitStatus("Recording...");

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
          this.setProcessingState(true);
          this.emitStatus("Processing...");

          try {
            await this.processCommand(this.lastVoskFinal || "");
          } catch (e) {
            console.warn("startVoskChunk processing error:", e);
          } finally {
            this.processingCommand = false;
            this.setProcessingState(false);
            this.lastVoskFinal = null;
          }
        } else {
          this.emitStatus("No command detected.");
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
            this.emitStatus("Listening (ready)");
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

  private setProcessingState(processing: boolean) {
    try {
      console.debug("VoiceAssistantService: processing ->", processing);
      this.onProcessingStateChange?.(processing);
    } catch (e) {
      console.error("onProcessingStateChange handler threw:", e);
    }
  }

  private initializeCommands() {
    this.registerCommand({
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

    this.registerCommand({
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
        await this.handleWhereAmI();
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

   
    this.registerCommand({
      command: "open camera",
      description: "Opens the device camera",
      keywords: ["open camera", "camera", "cam"],
      action: async () => {
        try {
          this.emitStatus("Opening camera");
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
      this.preventRecordingDuringSpeak = true;

      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) await Speech.stop();

      Speech.speak(text, {
        language: "en",
        pitch: options?.pitch || 1.0,
        rate: options?.rate || 0.9,
      });

      const start = Date.now();
      const timeoutMs = 30000;
      while (true) {
        const speaking = await Speech.isSpeakingAsync();
        if (!speaking) break;
        if (Date.now() - start > timeoutMs) {
          console.warn("TTS speak() timeout reached");
          break;
        }
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

    const triggerMatch = normalizedCommand.match(/\b2b\b/);
    if (triggerMatch) {
      
      const userQuery = commandText.replace(/.*?\b2b\b[\s:,-]*/i, "").trim();
      if (!userQuery) {
        const msg = 'Please provide a question after "2b".';
        await this.speak(msg);
        return { success: false, message: msg };
      }

      try {
       
        const prompt = `User asked: "${userQuery}". You are Unit 2B from nier automata, a concise and helpful voice assistant. Reply briefly (one or two short sentences) in Unit 2B style from nier automata. If the audio appears noisy or the question is unclear, infer the most likely intent and answer succinctly; if you cannot safely infer intent, ask one short clarifying question. When giving documentation-like output, prefer Context7 formatting.`;

        const llmReply = await queryLLM(prompt).catch((e) => {
          console.warn("LLM query failed:", e);
          return null;
        });

        if (!llmReply) {
          const msg = "Unable to get a response from the assistant.";
          this.emitStatus(msg);
          await this.speak(msg);
          return { success: false, message: msg };
        }

        this.emitStatus(llmReply);
        this.speak(llmReply);
        try {

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

    if (this.commands.has(normalizedCommand)) {
      const command = this.commands.get(normalizedCommand)!;
      await command.action();
      try {
        await historyService.add(command.command);
      } catch {}
      return { success: true, message: "Command executed successfully" };
    }

    for (const [key, command] of this.commands.entries()) {
      if (normalizedCommand.includes(key) || key.includes(normalizedCommand)) {
        await command.action();
        try {
          await historyService.add(command.command);
        } catch {}
        return { success: true, message: "Command executed successfully" };
      }
    }

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

    const command = this.commands.get(normalizedCommand);
    if (command) {
      await command.action();
      return { success: true, message: `Command executed: ${command.command}` };
    }

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

    const openMatch = normalizedCommand.match(/^(open|launch|start)\s+(.+)$/);
    if (openMatch) {
      const appQuery = openMatch[2].trim();
      try {
        const aliasKey = appQuery.toLowerCase().replace(/\s+/g, "");
        if (this.APP_ALIASES[aliasKey]) {
          const pkg = this.APP_ALIASES[aliasKey];
          this.emitStatus(`Opening ${appQuery}`);
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

    try {
      const prompt = `User said: "${commandText}". You are Unit 2B, a concise useful voice assistant. Reply briefly (one or two sentences). If the user intends to open an application, respond exactly with: OPEN_APP: <app name>. Otherwise give a short helpful answer.`;
      const llmReply = await queryLLM(prompt).catch((e) => {
        console.warn("LLM query failed:", e);
        return null;
      });

      if (!llmReply) {
        return { success: false, message: "Command not recognized" };
      }

      const openMatch = llmReply.match(/^OPEN_APP:\s*(.+)$/i);
      if (openMatch) {
        const appName = openMatch[1].trim();
        const res = await this.handleAppLaunch(appName);
        return res;
      }

      this.emitStatus(llmReply);
      this.speak(llmReply);
      try {
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
      this.emitStatus(msg);
      await this.speak(msg);
      return { success: false, message: msg };
    }
    this.emitStatus(`Searching for ${appName}`);
    const apps = await appDetectionService.getInstalledApps();

    if (apps.length === 0) {
      const msg = "No applications detected. Please check app permissions.";
      await this.speak(msg);
      return { success: false, message: msg };
    }

    const searchTerm = appName.toLowerCase().trim();

    const aliasKey = searchTerm.replace(/\s+/g, "");
    if (this.APP_ALIASES[aliasKey]) {
      const pkg = this.APP_ALIASES[aliasKey];
      this.emitStatus(`Opening ${appName}`);
      this.speak(`Opening ${appName}`);
      const res = await appDetectionService.launchApp(pkg);
      if (res.success) {
        try {
          await historyService.add(`open ${appName}`);
        } catch {}
        return { success: true, message: `Launched ${appName}` };
      }
    }

    for (const w of searchTerm.split(/\s+/)) {
      if (this.APP_ALIASES[w]) {
        const pkg = this.APP_ALIASES[w];
        this.emitStatus(`Opening ${appName}`);
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

    let matchingApp = apps.find(
      (app) => app.appName.toLowerCase() === searchTerm
    );

    if (!matchingApp) {
      matchingApp = apps.find((app) =>
        app.appName.toLowerCase().includes(searchTerm)
      );
    }

    if (!matchingApp) {
      matchingApp = apps.find((app) =>
        app.packageName.toLowerCase().includes(searchTerm)
      );
    }

    if (!matchingApp) {
      const searchWords = searchTerm.split(/\s+/);
      matchingApp = apps.find((app) => {
        const appNameLower = app.appName.toLowerCase();
        return searchWords.every((word) => appNameLower.includes(word));
      });
    }

    if (matchingApp) {
      const pkgLower = (matchingApp.packageName || "").toLowerCase();
      const askedSettings =
        searchTerm.includes("setting") || searchTerm.includes("settings");
      if (pkgLower.includes("settings") && !askedSettings) {
      } else {
        this.emitStatus(`Opening ${matchingApp.appName}`);
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
      const { app: fuzzyApp, score } = this.findBestFuzzyApp(apps, searchTerm);
      const isCameraQuery = /\bcam|camera\b/.test(searchTerm);
      const threshold = isCameraQuery ? 0.5 : 0.6;
      if (fuzzyApp && score >= threshold) {
        this.emitStatus(`Opening ${fuzzyApp.appName}`);
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
        this.emitStatus(msg);
        await this.speak(
          `Application ${appName} not found. Did you mean: ${suggestions}?`
        );
        return { success: false, message: msg };
      } else {
        const msg = `Application "${appName}" not found. Use "list apps" to see available applications.`;
        this.emitStatus(msg);
        await this.speak(
          `Application ${appName} not found. Use "list apps" to see available applications.`
        );
        return { success: false, message: msg };
      }
    }
  }

  private async ensureVoskModel(): Promise<boolean> {
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

  private async ensureMicPermission(): Promise<boolean> {
    try {
      if (this.haveMicPermission) return true;
      if (Platform.OS !== "android") {
        // iOS handled elsewhere
        this.haveMicPermission = true;
        return true;
      }
      if (this.voskDebug)
        console.debug("ensureMicPermission: checking existing permission");
      const checked = await PermissionsAndroid.check(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
      );
      if (checked) {
        this.haveMicPermission = true;
        if (this.voskDebug)
          console.debug("ensureMicPermission: already granted");
        return true;
      }
      if (this.voskDebug)
        console.debug("ensureMicPermission: requesting permission");
      const perm = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Microphone Permission",
          message:
            "This app needs access to your microphone for speech recognition.",
          buttonPositive: "OK",
        }
      );
      if (this.voskDebug)
        console.debug("ensureMicPermission: request result", perm);
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

  // ---------------- RECORDING & RECOGNITION ----------------
 
  async startListening(): Promise<boolean> {
    if (this.isListening || this.processingCommand) return false;

    // Ensure microphone permission first
    if (Platform.OS === "android") {
      if (this.voskDebug)
        console.debug("startListening: checking mic permission");
      const ok = await this.ensureMicPermission();
      if (!ok) {
        await this.speak(
          "Microphone permission required. Please enable microphone access in app settings."
        );
        this.emitStatus("Microphone permission required.");
        this.isListening = false;
        this.setListeningState(false);
        return false;
      }
    }

    if (Platform.OS === "android" && (NativeModules as any).VoskSpeech) {
      try {
        if (this.voskDebug)
          console.debug("Vosk: native module detected, starting native path");

        const perm = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: "Microphone Permission",
            message:
              "This app needs access to your microphone for offline speech recognition.",
            buttonPositive: "OK",
          }
        );
        if (perm !== PermissionsAndroid.RESULTS.GRANTED) {
          await this.speak(
            "Microphone permission required. Please enable microphone access in app settings."
          );
          this.emitStatus("Microphone permission required.");
          this.isListening = false;
          this.setListeningState(false);
          return false;
        }

        const okModel = await this.ensureVoskModel();
        if (!okModel) {
          this.emitStatus(
            "Offline speech model failed to initialize. Please ensure the model is placed in android/app/src/main/assets/model/"
          );
          this.usingVosk = false;
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
          async (payload: any) => {
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
            this.emitStatus(`Vosk error: ${payload?.error || "unknown"}`);
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
            this.emitStatus("Vosk requires RECORD_AUDIO permission.");
          }
        );

        if (this.voskDebug) console.debug("Vosk: starting native chunk loop");
        try {
          if (this.voskMaxListenTimer) {
            try {
              clearTimeout(this.voskMaxListenTimer);
            } catch (e) {}
            this.voskMaxListenTimer = null;
          }

          Speech.speak("Listening to your command.");

          this.isListening = true;
          this.setListeningState(true);
          this.emitStatus("Listening (offline)");

          this.startVoskChunk();
          return true;
        } catch (e) {
          console.warn("Failed to start Vosk native chunk loop:", e);
          this.emitStatus("Failed to start native speech recognition.");
          this.usingVosk = false;
          return false;
        }
      } catch (err) {
        console.error("Error starting Vosk listening:", err);
        this.usingVosk = false;
      }
    }

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
          this.isListening = false;
          this.setListeningState(false);
          return false;
        }
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
      this.setListeningState(true);

      this.preventRecordingDuringSpeak = true;
      Speech.speak("Listening to your command.");
      this.emitStatus("Listening to your command");

      setTimeout(() => {
        this.preventRecordingDuringSpeak = false;
      }, 600);

      await this.startRecording();
      return true;
    } catch (error) {
      console.error("Error starting listening:", error);
      this.isListening = false;
      this.setListeningState(false);
      this.emitStatus("Error starting voice recognition.");
      return false;
    }
  }

  async stopListening(): Promise<void> {
    if (!this.isListening) return;

    this.isListening = false;
    this.setListeningState(false);

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

    this.voskPaused = false;
    this.lastVoskFinal = null;

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
        this.emitStatus("Stop listening");
        await this.speak("Stop listening");
      }
      return;
    }

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
      this.emitStatus("Stop listening");
      await this.speak("Stop listening");
    }
  }

  private async startRecording() {
    if (!this.isListening || this.processingCommand) return;

    // If native Vosk is present, avoid starting Expo recordings to prevent conflicts
    if (Platform.OS === "android" && (NativeModules as any).VoskSpeech) {
      if (this.voskDebug)
        console.debug(
          "startRecording: skipping Expo recording because Vosk native is available"
        );
      return;
    }

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
      this.emitStatus("Recording...");

      this.recordingTimer = setTimeout(async () => {
        await this.stopRecording();
      }, 5000);
    } catch (err) {
      console.error("Error starting recording:", err);
      this.isListening = false;
      this.setListeningState(false);
      this.emitStatus("An error occurred while starting to record.");
    } finally {
      this.preparingRecording = false;
    }
  }

 
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

  private async stopRecording() {
    if (!this.recording || !this.isListening) return;

    this.processingCommand = true;
    this.emitStatus("Processing...");

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
      this.emitStatus("An error occurred while recording.");
    } finally {
      this.recording = null;
    }

    if (!uri) {
      this.emitStatus("No audio detected.");
    } else {
      try {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (!fileInfo.exists || fileInfo.size < 2000) {
          this.emitStatus("No command detected.");
        } else {
    
          if (Platform.OS === "android" && (NativeModules as any).VoskSpeech) {
            if (this.voskDebug)
              console.debug(
                "stopRecording: Vosk native available — relying on native events"
              );
          } else {
            this.emitStatus("Offline STT not available on this platform.");
          }
        }
      } catch (err) {
        console.error("Audio file error:", err);
        this.emitStatus("Audio file error.");
      }
    }

    this.processingCommand = false;

    const waitForSpeechToFinish = async () => {
      const isSpeaking = await Speech.isSpeakingAsync();
      if (isSpeaking) {
        setTimeout(waitForSpeechToFinish, 100);
        return;
      }

      if (this.isListening) {
        setTimeout(() => {
          if (this.isListening) {
            this.startRecording();
          }
        }, 1000);
      }
    };

    waitForSpeechToFinish();
  }

  private async recognizeAudio(uri: string): Promise<string | null> {
 
    if (this.voskDebug)
      console.debug("recognizeAudio: network STT disabled; returning null");
    return null;
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
      const scoreName = 1 - d / maxLen; 

      const prefixScore = name.startsWith(q) || pkg.startsWith(q) ? 1 : 0;

      const score = Math.max(scoreName, prefixScore);
      if (score > bestScore) {
        bestScore = score;
        best = app;
      }
    }
    return { app: best, score: bestScore };
  }

  public onNavigate?: (route: string) => void;

  public allowedListeningRoutes: string[] = [
    "VoiceAssistant",
    "Voice",
    "VoiceScreen",
  ];


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
