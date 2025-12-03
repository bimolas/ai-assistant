import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { YoRHaCard } from '../components/YoRHaCard';
import { YoRHaButton } from '../components/YoRHaButton';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { voiceService } from '../services/voiceService';

export const VoiceScreen: React.FC = () => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingUri, setRecordingUri] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      voiceService.stopRecording();
      voiceService.stopSpeaking();
    };
  }, []);

  const handleSpeak = (text: string) => {
    voiceService.speak(text);
  };

  const handleStartRecording = async () => {
    const result = await voiceService.startRecording();
    if (result) {
      setIsRecording(true);
      handleSpeak('Recording started');
    }
  };

  const handleStopRecording = async () => {
    const uri = await voiceService.stopRecording();
    if (uri) {
      setIsRecording(false);
      setRecordingUri(uri);
      handleSpeak('Recording saved');
    }
  };

  const handlePlayRecording = async () => {
    if (recordingUri) {
      setIsPlaying(true);
      await voiceService.playRecording(recordingUri);
      setIsPlaying(false);
    }
  };

  const quickPhrases = [
    'YoRHa unit 2B reporting',
    'All systems operational',
    'Mission accepted',
    'Engaging combat protocol',
    'Threat level assessed',
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.spacer} />

        <YoRHaCard elevated style={styles.recordingCard}>
          <Text style={styles.label}>VOICE RECORDING</Text>
          <View style={styles.recordingControls}>
            {!isRecording ? (
              <TouchableOpacity
                onPress={handleStartRecording}
                style={styles.recordButton}
              >
                <Ionicons name="mic" size={32} color={colors.accent} />
                <Text style={styles.recordButtonText}>Start Recording</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={handleStopRecording}
                style={[styles.recordButton, styles.recordingActive]}
              >
                <Ionicons name="stop" size={32} color={colors.error} />
                <Text style={styles.recordButtonText}>Stop Recording</Text>
              </TouchableOpacity>
            )}
            
            {recordingUri && !isRecording && (
              <TouchableOpacity
                onPress={handlePlayRecording}
                style={styles.playButton}
                disabled={isPlaying}
              >
                <Ionicons
                  name={isPlaying ? 'pause' : 'play'}
                  size={24}
                  color={colors.textPrimary}
                />
                <Text style={styles.playButtonText}>
                  {isPlaying ? 'Playing...' : 'Play Recording'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </YoRHaCard>

        <YoRHaCard style={styles.phrasesCard}>
          <Text style={styles.label}>QUICK PHRASES</Text>
          <Text style={styles.bodyText}>
            Tap any phrase to hear it spoken:
          </Text>
          {quickPhrases.map((phrase, index) => (
            <YoRHaButton
              key={index}
              title={phrase}
              onPress={() => handleSpeak(phrase)}
              variant="outline"
              style={styles.phraseButton}
            />
          ))}
        </YoRHaCard>

        <YoRHaCard style={styles.infoCard}>
          <Text style={styles.label}>VOICE CAPABILITIES</Text>
          <View style={styles.capabilityRow}>
            <Ionicons name="volume-high" size={20} color={colors.accent} />
            <Text style={styles.capabilityText}>Text-to-Speech</Text>
          </View>
          <View style={styles.capabilityRow}>
            <Ionicons name="mic" size={20} color={colors.accent} />
            <Text style={styles.capabilityText}>Voice Recording</Text>
          </View>
          <View style={styles.capabilityRow}>
            <Ionicons name="play" size={20} color={colors.accent} />
            <Text style={styles.capabilityText}>Playback System</Text>
          </View>
        </YoRHaCard>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  spacer: {
    height: 50,
  },
  recordingCard: {
    marginBottom: 16,
  },
  label: {
    ...typography.label,
    marginBottom: 16,
  },
  recordingControls: {
    gap: 12,
  },
  recordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.surfaceHigh,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.accent,
    gap: 12,
  },
  recordingActive: {
    borderColor: colors.error,
    backgroundColor: colors.error + '20',
  },
  recordButtonText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  playButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    gap: 8,
  },
  playButtonText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  phrasesCard: {
    marginBottom: 16,
  },
  bodyText: {
    ...typography.body,
    marginBottom: 16,
  },
  phraseButton: {
    marginBottom: 8,
  },
  infoCard: {
    marginBottom: 16,
  },
  capabilityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  capabilityText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});

