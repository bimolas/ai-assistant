import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YoRHaLogoImage } from '../components/YoRHaLogoImage';
import { YoRHaCard } from '../components/YoRHaCard';
import { YoRHaButton } from '../components/YoRHaButton';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { voiceService } from '../services/voiceService';

export const HomeScreen: React.FC = () => {
  const handleGreeting = () => {
    voiceService.speak('YoRHa unit 2B online. All systems operational.');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <YoRHaLogoImage size={170} />
        </View>

        <YoRHaCard elevated style={styles.statusCard}>
          <Text style={styles.label}>SYSTEM STATUS</Text>
          <View style={styles.statusRow}>
            <View style={styles.statusIndicator} />
            <Text style={styles.statusText}>All systems operational</Text>
          </View>
        </YoRHaCard>

        <YoRHaCard style={styles.infoCard}>
          <Text style={styles.label}>MISSION BRIEFING</Text>
          <Text style={styles.bodyText}>
            Welcome to the YoRHa interface. This unit is equipped with voice
            capabilities and task management systems. Navigate through the
            tabs to access different functions.
          </Text>
        </YoRHaCard>

        <YoRHaButton
          title="Activate Voice Greeting"
          onPress={handleGreeting}
          variant="primary"
        />
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
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 50,
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
    backgroundColor: colors.success,
    marginRight: 12,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  statusText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  infoCard: {
    marginBottom: 24,
  },
  bodyText: {
    ...typography.body,
    lineHeight: 24,
  },
});

