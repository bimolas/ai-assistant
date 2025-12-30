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

export class CommandProcessorService {
  private commands: Map<string, VoiceCommand> = new Map();
  private onSpeak?: (text: string) => Promise<void>;
  private onStatusUpdate?: (message: string) => void;
  private onNavigate?: (route: string) => void;
  
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

  constructor(
    onSpeak?: (text: string) => Promise<void>,
    onStatusUpdate?: (message: string) => void,
    onNavigate?: (route: string) => void
  ) {
    this.onSpeak = onSpeak;
    this.onStatusUpdate = onStatusUpdate;
    this.onNavigate = onNavigate;
    this.initializeCommands();
  }

  private initializeCommands() {
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
      },
    });

    this.registerCommand({
      command: "what time is it",
      description: "Tells the current time",
      keywords: ["time"],
      action: async () => {
        const now = new Date();
        await this.onSpeak?.(`The time is ${now.toLocaleTimeString()}`);
      },
    });

    this.registerCommand({
      command: "what day is it",
      description: "Tells the current date",
      keywords: ["day", "date", "today"],
      action: async () => {
        const now = new Date();
        await this.onSpeak?.(`Today is ${now.toLocaleDateString()}`);
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
          await this.onSpeak?.("Opening application list");
        } catch (err) {
          console.error("Error opening app list:", err);
          await this.onSpeak?.("Unable to open application list");
        }
      },
    });

    this.registerCommand({
      command: "open camera",
      description: "Opens the device camera",
      keywords: ["open camera", "camera", "cam"],
      action: async () => {
      },
    });

    this.registerCommand({
      command: "hello",
      description: "Greets the user",
      keywords: ["hello", "hi"],
      action: async () => {
        await this.onSpeak?.("Hello. Unit 2B at your service.");
      },
    });

    this.registerCommand({
      command: "status",
      description: "Reports system status",
      keywords: ["status"],
      action: async () => {
        await this.onSpeak?.(
          "All systems operational. Unit 2B ready for commands."
        );
      },
    });
  }

  registerCommand(command: VoiceCommand) {
    this.commands.set(command.command.toLowerCase(), command);
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
        await this.onSpeak?.(msg);
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
          this.onStatusUpdate?.(msg);
          await this.onSpeak?.(msg);
          return { success: false, message: msg };
        }

        this.onStatusUpdate?.(llmReply);
        this.onSpeak?.(llmReply);
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
          this.onStatusUpdate?.(`Opening ${appQuery}`);
          this.onSpeak?.(`Opening ${appQuery}`);
          try {
            await historyService.add(`open ${appQuery}`);
          } catch {}
          return { success: true, message: `Launched ${appQuery}` };
        }
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
        return { success: true, message: `App launch requested: ${appName}` };
      }

      this.onStatusUpdate?.(llmReply);
      this.onSpeak?.(llmReply);
      try {
        await historyService.addWithResponse(commandText, llmReply);
      } catch {}
      return { success: true, message: "LLM response delivered" };
    } catch (err) {
      console.error("LLM fallback error:", err);
      return { success: false, message: "Command not recognized" };
    }
  }

  getAvailableCommands(): VoiceCommand[] {
    return Array.from(this.commands.values());
  }

  getAppAliases(): Record<string, string> {
    return this.APP_ALIASES;
  }
}