import * as Speech from "expo-speech";
import { Audio } from "expo-av";

export class VoiceService {
  private static instance: VoiceService;
  private recording: Audio.Recording | null = null;
  private isRecording = false;

  static getInstance(): VoiceService {
    if (!VoiceService.instance) {
      VoiceService.instance = new VoiceService();
    }
    return VoiceService.instance;
  }

  // Text to Speech
  async speak(text: string, options?: { rate?: number; pitch?: number }) {
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) {
      await Speech.stop();
    }

    return Speech.speak(text, {
      language: "en",
      pitch: options?.pitch || 1.0,
      rate: options?.rate || 0.9,
    });
  }

  async stopSpeaking() {
    const isSpeaking = await Speech.isSpeakingAsync();
    if (isSpeaking) {
      await Speech.stop();
    }
  }

  // Voice Recording
  async startRecording(): Promise<string | null> {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
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
      this.isRecording = true;
      return "Recording started";
    } catch (err) {
      console.error("Failed to start recording", err);
      return null;
    }
  }

  async stopRecording(): Promise<string | null> {
    if (!this.recording || !this.isRecording) return null;

    try {
      this.isRecording = false;
      await this.recording.stopAndUnloadAsync();

      const uri = this.recording.getURI();
      this.recording = null;

      return uri || null;
    } catch (err) {
      console.error("Failed to stop recording", err);
      return null;
    }
  }

  async playRecording(uri: string) {
    try {
      const { sound } = await Audio.Sound.createAsync({ uri });
      await sound.playAsync();

      return new Promise<void>((resolve) => {
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) {
            sound.unloadAsync();
            resolve();
          }
        });
      });
    } catch (error) {
      console.error("Failed to play recording", error);
    }
  }

  isCurrentlyRecording(): boolean {
    return this.isRecording;
  }
}

export const voiceService = VoiceService.getInstance();
