import React from 'react';
import { View, StyleSheet, ImageStyle } from 'react-native';
import { ImageBackground } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

interface BackgroundImageProps {
  source?: { uri: string } | number;
  children: React.ReactNode;
  overlay?: boolean;
}

export const BackgroundImage: React.FC<BackgroundImageProps> = ({
  source,
  children,
  overlay = true,
}) => {
  if (source) {
    return (
      <ImageBackground
        source={source}
        style={styles.background}
        contentFit="cover"
      >
        {overlay && (
          <LinearGradient
            colors={[colors.background + 'F0', colors.background + 'E0', colors.background + 'FF']}
            style={styles.overlay}
          />
        )}
        {children}
      </ImageBackground>
    );
  }

  return (
    <View style={styles.container}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  background: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
});

