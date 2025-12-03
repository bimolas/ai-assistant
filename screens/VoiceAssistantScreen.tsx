import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { YoRHaCard } from '../components/YoRHaCard';
import { YoRHaButton } from '../components/YoRHaButton';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { voiceAssistantService, VoiceCommand } from '../services/voiceAssistantService';

export const VoiceAssistantScreen: React.FC = () => {
  const [isListening, setIsListening] = useState(false);
  const [commandText, setCommandText] = useState('');
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  const [availableCommands, setAvailableCommands] = useState<VoiceCommand[]>([]);

  useEffect(() => {
    loadCommands();
  }, []);

  const loadCommands = () => {
    const commands = voiceAssistantService.getAvailableCommands();
    setAvailableCommands(commands);
  };

  const handleStartListening = async () => {
    const result = await voiceAssistantService.startListening();
    if (result) {
      setIsListening(true);
      setLastResponse('Listening... Speak your command');
    }
  };

  const handleStopListening = async () => {
    const uri = await voiceAssistantService.stopListening();
    setIsListening(false);
    if (uri) {
      setLastResponse('Processing command...');
      // Note: In a full implementation, you'd send the audio to a speech recognition service
      // For now, we'll use manual text input
    }
  };

  const handleProcessCommand = async () => {
    if (!commandText.trim()) return;

    setLastResponse('Processing...');
    const result = await voiceAssistantService.processCommand(commandText);
    
    if (result.success) {
      setLastResponse(result.message || `Command executed: ${commandText}`);
    } else {
      setLastResponse(result.message || `Unknown command: ${commandText}. Say "help" for available commands.`);
    }
    setCommandText('');
  };

  const handleQuickCommand = async (command: string) => {
    setCommandText(command);
    await voiceAssistantService.processCommand(command);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled={true}
      >
        <View style={styles.spacer} />

        <YoRHaCard elevated style={styles.statusCard}>
          <Text style={styles.label}>VOICE ASSISTANT</Text>
          <View style={styles.statusRow}>
            <View style={[styles.statusIndicator, isListening && styles.statusActive]} />
            <Text style={styles.statusText}>
              {isListening ? 'LISTENING' : 'STANDBY'}
            </Text>
          </View>
        </YoRHaCard>

        {/* Voice Control */}
        <YoRHaCard style={styles.controlCard}>
          <Text style={styles.label}>VOICE CONTROL</Text>
          {!isListening ? (
            <YoRHaButton
              title="Start Listening"
              onPress={handleStartListening}
              variant="primary"
              style={styles.controlButton}
            />
          ) : (
            <YoRHaButton
              title="Stop Listening"
              onPress={handleStopListening}
              variant="outline"
              style={styles.controlButton}
            />
          )}
        </YoRHaCard>

        {/* Manual Command Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="open [app name]..."
            placeholderTextColor={colors.textTertiary}
            value={commandText}
            onChangeText={setCommandText}
            onSubmitEditing={handleProcessCommand}
          />
          <YoRHaButton
            title="Execute Command"
            onPress={handleProcessCommand}
            variant="primary"
          />
        </View>

        {/* Last Response */}
        {lastResponse && (
          <YoRHaCard style={styles.responseCard}>
            <Text style={styles.label}>RESPONSE</Text>
            <Text style={styles.responseText}>{lastResponse}</Text>
          </YoRHaCard>
        )}

        {/* App Launch Examples */}
        <YoRHaCard style={styles.examplesCard}>
          <Text style={styles.label}>APP LAUNCH EXAMPLES</Text>
          <Text style={styles.exampleText}>Try these commands:</Text>
          <View style={styles.examplesList}>
            <View style={styles.exampleItem}>
              <Text style={styles.exampleCommand}>open WhatsApp</Text>
              <Text style={styles.exampleDesc}>Launches WhatsApp</Text>
            </View>
            <View style={styles.exampleItem}>
              <Text style={styles.exampleCommand}>open Chrome</Text>
              <Text style={styles.exampleDesc}>Launches Chrome browser</Text>
            </View>
            <View style={styles.exampleItem}>
              <Text style={styles.exampleCommand}>open YouTube</Text>
              <Text style={styles.exampleDesc}>Launches YouTube app</Text>
            </View>
            <View style={styles.exampleItem}>
              <Text style={styles.exampleCommand}>open Camera</Text>
              <Text style={styles.exampleDesc}>Launches Camera app</Text>
            </View>
          </View>
        </YoRHaCard>

        {/* Quick Commands */}
        <YoRHaCard style={styles.commandsCard}>
          <Text style={styles.label}>QUICK COMMANDS</Text>
          <View style={styles.commandsGrid}>
            {availableCommands.slice(0, 6).map((cmd, index) => (
              <TouchableOpacity
                key={index}
                onPress={() => handleQuickCommand(cmd.command)}
                style={styles.commandButton}
                activeOpacity={0.7}
              >
                <Text style={styles.commandText}>{cmd.command}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </YoRHaCard>

        {/* Available Commands List */}
        <YoRHaCard style={styles.listCard}>
          <Text style={styles.label}>AVAILABLE COMMANDS</Text>
          {availableCommands.map((cmd, index) => (
            <View key={index} style={styles.commandItem}>
              <View style={styles.commandBullet} />
              <View style={styles.commandDetails}>
                <Text style={styles.commandName}>{cmd.command}</Text>
                <Text style={styles.commandDesc}>{cmd.description}</Text>
              </View>
            </View>
          ))}
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
  statusCard: {
    marginBottom: 16,
  },
  label: {
    ...typography.label,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.textTertiary,
    marginRight: 12,
  },
  statusActive: {
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  statusText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  controlCard: {
    marginBottom: 16,
  },
  controlButton: {
    marginTop: 12,
  },
  inputContainer: {
    marginBottom: 16,
    gap: 12,
  },
  input: {
    ...typography.body,
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    color: colors.textPrimary,
  },
  executeButton: {
    marginTop: 0,
  },
  responseCard: {
    marginBottom: 16,
  },
  responseText: {
    ...typography.body,
    color: colors.textSecondary,
    fontStyle: 'italic',
  },
  hintText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: 12,
    fontStyle: 'italic',
  },
  examplesCard: {
    marginBottom: 16,
  },
  exampleText: {
    ...typography.body,
    color: colors.textSecondary,
    marginBottom: 12,
  },
  examplesList: {
    marginTop: 8,
  },
  exampleItem: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  exampleCommand: {
    ...typography.body,
    color: colors.accent,
    fontWeight: '600',
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  exampleDesc: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  commandsCard: {
    marginBottom: 16,
  },
  commandsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  commandButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
    marginBottom: 8,
  },
  commandText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
  },
  listCard: {
    marginBottom: 16,
  },
  commandItem: {
    flexDirection: 'row',
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  commandBullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 6,
    marginRight: 12,
  },
  commandDetails: {
    flex: 1,
  },
  commandName: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
    marginBottom: 4,
  },
  commandDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  },
});

