import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

export const YoRHaLogo: React.FC<{ size?: number }> = ({ size = 40 }) => {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <LinearGradient
        colors={[colors.accent, colors.accentDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        <View style={styles.innerCircle} />
        <View style={styles.cross}>
          <View style={styles.crossVertical} />
          <View style={styles.crossHorizontal} />
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  gradient: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 8,
  },
  innerCircle: {
    width: '60%',
    height: '60%',
    borderRadius: 100,
    backgroundColor: colors.surfaceHigh,
    position: 'absolute',
  },
  cross: {
    width: '70%',
    height: '70%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  crossVertical: {
    width: 3,
    height: '100%',
    backgroundColor: colors.accent,
    position: 'absolute',
  },
  crossHorizontal: {
    width: '100%',
    height: 3,
    backgroundColor: colors.accent,
    position: 'absolute',
  },
});

