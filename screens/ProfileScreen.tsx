import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { YoRHaLogo } from '../components/YoRHaLogo';
import { YoRHaCard } from '../components/YoRHaCard';
import { CircularImage } from '../components/CircularImage';
import { getImage } from '../utils/imageAssets';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

export const ProfileScreen: React.FC = () => {
  const stats = [
    { label: 'Model', value: 'YoRHa No.2 Type B' },
    { label: 'Serial Number', value: '2B' },
    { label: 'Status', value: 'Operational' },
    { label: 'Combat Rating', value: 'S-Class' },
    { label: 'Deployment', value: 'Earth' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <CircularImage 
            source={getImage('character', '2b')} 
            size={150} 
            borderWidth={4}
          />
        </View>

        <YoRHaCard elevated style={styles.statsCard}>
          <Text style={styles.label}>UNIT SPECIFICATIONS</Text>
          {stats.map((stat, index) => (
            <View key={index} style={styles.statRow}>
              <Text style={styles.statLabel}>{stat.label}</Text>
              <Text style={styles.statValue}>{stat.value}</Text>
            </View>
          ))}
        </YoRHaCard>

        <YoRHaCard style={styles.bioCard}>
          <Text style={styles.label}>UNIT PROFILE</Text>
          <Text style={styles.bioText}>
            YoRHa No.2 Type B, commonly referred to as 2B, is an all-purpose
            battle android deployed as an infantry unit in the YoRHa forces.
            This unit is designed for combat missions and excels in both
            close-quarters and ranged combat scenarios.
          </Text>
        </YoRHaCard>

        <YoRHaCard style={styles.systemsCard}>
          <Text style={styles.label}>ACTIVE SYSTEMS</Text>
          <View style={styles.systemItem}>
            <View style={styles.systemIndicator} />
            <Text style={styles.systemText}>Combat Protocol</Text>
          </View>
          <View style={styles.systemItem}>
            <View style={styles.systemIndicator} />
            <Text style={styles.systemText}>Voice Interface</Text>
          </View>
          <View style={styles.systemItem}>
            <View style={styles.systemIndicator} />
            <Text style={styles.systemText}>Task Management</Text>
          </View>
          <View style={styles.systemItem}>
            <View style={styles.systemIndicator} />
            <Text style={styles.systemText}>Navigation Systems</Text>
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
  header: {
    alignItems: 'center',
    marginBottom: 24,
    marginTop: 50,
  },
  statsCard: {
    marginBottom: 16,
  },
  label: {
    ...typography.label,
    marginBottom: 16,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  statLabel: {
    ...typography.bodySmall,
    color: colors.textTertiary,
  },
  statValue: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  bioCard: {
    marginBottom: 16,
  },
  bioText: {
    ...typography.body,
    lineHeight: 24,
  },
  systemsCard: {
    marginBottom: 16,
  },
  systemItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  systemIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
    marginRight: 12,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  systemText: {
    ...typography.body,
    color: colors.textSecondary,
  },
});

