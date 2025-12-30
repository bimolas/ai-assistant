import * as Speech from "expo-speech";

export class TextToSpeechService {
  private preventRecordingDuringSpeak = false;
  
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

  isPreventingRecording(): boolean {
    return this.preventRecordingDuringSpeak;
  }
}