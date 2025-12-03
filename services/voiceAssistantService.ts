import * as Speech from 'expo-speech';
import { Audio } from 'expo-av';
import { appDetectionService } from './appDetectionService';
import { Platform } from 'react-native';

export interface VoiceCommand {
  command: string;
  action: () => Promise<void> | void;
  description: string;
}

class VoiceAssistantService {
  private static instance: VoiceAssistantService;
  private isListening = false;
  private recording: Audio.Recording | null = null;
  private commands: Map<string, VoiceCommand> = new Map();

  static getInstance(): VoiceAssistantService {
    if (!VoiceAssistantService.instance) {
      VoiceAssistantService.instance = new VoiceAssistantService();
      VoiceAssistantService.instance.initializeCommands();
    }
    return VoiceAssistantService.instance;
  }

  private initializeCommands() {
    // System commands
    this.registerCommand({
      command: 'open settings',
      description: 'Opens device settings',
      action: async () => {
        await this.speak('Opening settings');
        // Would need expo-intent-launcher for this
      },
    });

    this.registerCommand({
      command: 'what time is it',
      description: 'Tells the current time',
      action: async () => {
        const now = new Date();
        const time = now.toLocaleTimeString();
        await this.speak(`The time is ${time}`);
      },
    });

    this.registerCommand({
      command: 'what day is it',
      description: 'Tells the current date',
      action: async () => {
        const now = new Date();
        const date = now.toLocaleDateString();
        await this.speak(`Today is ${date}`);
      },
    });

    // App detection commands
    this.registerCommand({
      command: 'list apps',
      description: 'Lists installed apps',
      action: async () => {
        await this.speak('Scanning installed applications');
        const apps = await appDetectionService.getInstalledApps();
        if (apps.length === 0) {
          await this.speak('No applications detected. Full app detection requires additional permissions.');
        } else {
          await this.speak(`Found ${apps.length} application${apps.length > 1 ? 's' : ''}`);
        }
      },
    });

    // Greeting commands
    this.registerCommand({
      command: 'hello',
      description: 'Greets the user',
      action: async () => {
        await this.speak('Hello. Unit 2B at your service.');
      },
    });

    this.registerCommand({
      command: 'status',
      description: 'Reports system status',
      action: async () => {
        await this.speak('All systems operational. Unit 2B ready for commands.');
      },
    });

    // Help command
    this.registerCommand({
      command: 'help',
      description: 'Lists available commands',
      action: async () => {
        const commandList = Array.from(this.commands.values())
          .map(cmd => cmd.command)
          .join(', ');
        await this.speak(`Available commands: ${commandList}`);
      },
    });
  }

  registerCommand(command: VoiceCommand) {
    this.commands.set(command.command.toLowerCase(), command);
  }

  async speak(text: string, options?: { rate?: number; pitch?: number }): Promise<void> {
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) {
      await Speech.stop();
    }

    return Speech.speak(text, {
      language: 'en',
      pitch: options?.pitch || 1.0,
      rate: options?.rate || 0.9,
    });
  }

  async stopSpeaking(): Promise<void> {
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) {
      await Speech.stop();
    }
  }

  async processCommand(commandText: string): Promise<{ success: boolean; message?: string }> {
    const normalizedCommand = commandText.toLowerCase().trim();
    
    // Check for app launch commands FIRST (before other commands)
    if (normalizedCommand.startsWith('open ') || normalizedCommand.startsWith('launch ')) {
      const appName = normalizedCommand.replace(/^(open|launch)\s+/, '').trim();
      if (appName) {
        const result = await this.handleAppLaunch(appName);
        return result;
      }
    }
    
    // Check for exact match
    if (this.commands.has(normalizedCommand)) {
      const command = this.commands.get(normalizedCommand)!;
      await command.action();
      return { success: true, message: 'Command executed successfully' };
    }

    // Check for partial matches
    for (const [key, command] of this.commands.entries()) {
      if (normalizedCommand.includes(key) || key.includes(normalizedCommand)) {
        await command.action();
        return { success: true, message: 'Command executed successfully' };
      }
    }

    return { success: false, message: 'Unknown command. Say "help" for available commands.' };
  }

  private async handleAppLaunch(appName: string): Promise<{ success: boolean; message: string }> {
    if (!appName || appName.trim() === '') {
      const msg = 'Please specify an application name';
      await this.speak(msg);
      return { success: false, message: msg };
    }

    await this.speak(`Searching for ${appName}`);
    const apps = await appDetectionService.getInstalledApps();
    
    if (apps.length === 0) {
      const msg = 'No applications detected. Please check app permissions.';
      await this.speak(msg);
      return { success: false, message: msg };
    }

    const searchTerm = appName.toLowerCase().trim();
    
    // Try exact match first
    let matchingApp = apps.find(
      app => app.appName.toLowerCase() === searchTerm
    );

    // Try partial match in app name
    if (!matchingApp) {
      matchingApp = apps.find(
        app => app.appName.toLowerCase().includes(searchTerm)
      );
    }

    // Try partial match in package name
    if (!matchingApp) {
      matchingApp = apps.find(
        app => app.packageName.toLowerCase().includes(searchTerm)
      );
    }

    // Try fuzzy matching (words in app name)
    if (!matchingApp) {
      const searchWords = searchTerm.split(/\s+/);
      matchingApp = apps.find(app => {
        const appNameLower = app.appName.toLowerCase();
        return searchWords.every(word => appNameLower.includes(word));
      });
    }

    if (matchingApp) {
      await this.speak(`Launching ${matchingApp.appName}`);
      const result = await appDetectionService.launchApp(matchingApp.packageName);
      if (!result.success) {
        const errorMsg = result.error || 'Unable to launch application';
        const fullMsg = `Failed to launch ${matchingApp.appName}: ${errorMsg}`;
        await this.speak(`${errorMsg}. Mission failed.`);
        return { success: false, message: fullMsg };
      } else {
        const msg = `Successfully launched ${matchingApp.appName}`;
        await this.speak('Application launched successfully');
        return { success: true, message: msg };
      }
    } else {
      // Find similar apps
      const similar = apps.filter(app => {
        const appNameLower = app.appName.toLowerCase();
        return appNameLower.includes(searchTerm.substring(0, 3)) || 
               searchTerm.includes(appNameLower.substring(0, 3));
      }).slice(0, 3);

      if (similar.length > 0) {
        const suggestions = similar.map(app => app.appName).join(', ');
        const msg = `Application "${appName}" not found. Did you mean: ${suggestions}?`;
        await this.speak(`Application ${appName} not found. Did you mean: ${suggestions}?`);
        return { success: false, message: msg };
      } else {
        const msg = `Application "${appName}" not found. Use "list apps" to see available applications.`;
        await this.speak(`Application ${appName} not found. Use "list apps" to see available applications.`);
        return { success: false, message: msg };
      }
    }
  }

  async startListening(): Promise<string | null> {
    if (this.isListening) {
      return null;
    }

    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        await this.speak('Microphone permission required');
        return null;
      }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );

      this.recording = recording;
      this.isListening = true;
      
      await this.speak('Listening for commands');
      return 'Recording started';
    } catch (err) {
      console.error('Failed to start recording', err);
      return null;
    }
  }

  async stopListening(): Promise<string | null> {
    if (!this.recording || !this.isListening) {
      return null;
    }

    try {
      this.isListening = false;
      await this.recording.stopAndUnloadAsync();
      const uri = this.recording.getURI();
      this.recording = null;
      
      // Note: For full voice recognition, you'd need to send the audio to a service
      // For now, we'll return the URI for manual processing
      return uri;
    } catch (error) {
      console.error('Failed to stop recording', error);
      return null;
    }
  }

  getAvailableCommands(): VoiceCommand[] {
    return Array.from(this.commands.values());
  }

  isCurrentlyListening(): boolean {
    return this.isListening;
  }
}

export const voiceAssistantService = VoiceAssistantService.getInstance();

