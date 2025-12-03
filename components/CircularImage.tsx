import React from 'react';
import { View, StyleSheet, ImageStyle } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../theme/colors';
import { YoRHaLogo } from './YoRHaLogo';

interface CircularImageProps {
  source?: { uri: string } | number;
  size?: number;
  borderWidth?: number;
}

export const CircularImage: React.FC<CircularImageProps> = ({
  source,
  size = 150,
  borderWidth = 4,
}) => {
  const imageSize = size - (borderWidth * 2);

  if (source) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <View style={[styles.border, { width: size, height: size, borderRadius: size / 2, borderWidth }]}>
          <Image
            source={source}
            style={[styles.image, { width: imageSize, height: imageSize, borderRadius: imageSize / 2 }]}
            contentFit="cover"
            transition={300}
          />
        </View>
      </View>
    );
  }

  // Fallback with YoRHa logo
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <View style={[styles.border, { width: size, height: size, borderRadius: size / 2, borderWidth }]}>
        <View style={[styles.fallback, { width: imageSize, height: imageSize, borderRadius: imageSize / 2 }]}>
          <YoRHaLogo size={imageSize * 0.5} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  border: {
    borderColor: colors.brownDark,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  image: {
    overflow: 'hidden',
  },
  fallback: {
    backgroundColor: colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

