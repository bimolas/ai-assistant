import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { getImage } from '../utils/imageAssets';
import { YoRHaLogo } from './YoRHaLogo';

interface YoRHaLogoImageProps {
  size?: number;
}

export const YoRHaLogoImage: React.FC<YoRHaLogoImageProps> = ({ size = 100 }) => {
  const logoSource = getImage('logo', 'yorha');

  if (logoSource) {
    return (
      <View style={[styles.container, { width: size, height: size }]}>
        <Image
          source={logoSource}
          style={[styles.image, { width: size, height: size }]}
          contentFit="contain"
          transition={200}
        />
      </View>
    );
  }

  // Fallback to the programmatic logo
  return <YoRHaLogo size={size} />;
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    // Image will maintain aspect ratio
  },
});

