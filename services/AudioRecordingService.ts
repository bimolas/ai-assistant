import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";

export class AudioRecordingService {
  private recording: Audio.Recording | null = null;
  private recordingTimer: NodeJS.Timeout | null = null;
  private audioModeSet = false;
  private preparingRecording = false;
  private isListening = false;
  
  private onStatusUpdate?: (message: string) => void;
  private onRecordingComplete?: (uri: string) => void;
  private onRecordingStopped?: () => void; 
  
  constructor(
    onStatusUpdate?: (message: string) => void,
    onRecordingComplete?: (uri: string) => void,
    onRecordingStopped?: () => void
  ) {
    this.onStatusUpdate = onStatusUpdate;
    this.onRecordingComplete = onRecordingComplete;
    this.onRecordingStopped = onRecordingStopped;
  }

  async initializeAudioMode(): Promise<void> {
    if (!this.audioModeSet) {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        playThroughEarpieceAndroid: false,
      });
      this.audioModeSet = true;
    }
  }

  async startRecording(): Promise<boolean> {
    if (!this.isListening || this.preparingRecording) return false;

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
      
      return true;
    } catch (err) {
      console.error("Error starting recording:", err);
      this.onStatusUpdate?.("An error occurred while starting to record.");
      return false;
    } finally {
      this.preparingRecording = false;
    }
  }

  async stopRecording(): Promise<void> {
    if (!this.recording || !this.isListening) return;

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

    if (!uri) {
      this.onStatusUpdate?.("No audio detected.");
    } else {
      try {
        const fileInfo = await FileSystem.getInfoAsync(uri);
        if (!fileInfo.exists || fileInfo.size < 2000) {
          this.onStatusUpdate?.("No command detected.");
        } else {
          this.onRecordingComplete?.(uri);
        }
      } catch (err) {
        console.error("Audio file error:", err);
        this.onStatusUpdate?.("Audio file error.");
      }
    }
    
    this.onRecordingStopped?.();
  }

  private async cleanupRecording(): Promise<void> {
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

  setListeningState(isListening: boolean): void {
    this.isListening = isListening;
    
    if (!isListening && this.recordingTimer) {
      clearTimeout(this.recordingTimer);
      this.recordingTimer = null;
    }
  }

  isCurrentlyRecording(): boolean {
    return this.recording !== null;
  }
}