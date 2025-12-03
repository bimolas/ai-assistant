import React from 'react';
import { View, StyleSheet, ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import { YoRHaLogo } from './YoRHaLogo';

interface CharacterImageProps {
  source?: { uri: string } | number;
  size?: number;
  showGlow?: boolean;
}

export const CharacterImage: React.FC<CharacterImageProps> = ({
  source,
  size = 200,
  showGlow = true,
}) => {
  if (source) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        {showGlow && (
          <View style={[styles.glow, { width: size + 20, height: size + 20 }]} />
        )}
        <Image
          source={source}
          style={[styles.image, { width: size, height: size }]}
          contentFit="contain"
          transition={300}
        />
      </View>
    );
  }

  // Fallback with YoRHa logo
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {showGlow && (
        <LinearGradient
          colors={[colors.glow, 'transparent']}
          style={[styles.glow, { width: size + 20, height: size + 20 }]}
        />
      )}
      <View style={[styles.fallback, { width: size, height: size }]}>
        <YoRHaLogo size={size * 0.4} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  image: {
    borderRadius: 12,
    zIndex: 2,
  },
  glow: {
    position: 'absolute',
    borderRadius: 100,
    backgroundColor: colors.glow,
    zIndex: 1,
    opacity: 0.3,
  },
  fallback: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
});

