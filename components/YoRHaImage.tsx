import React from "react";
import { View, StyleSheet, ImageStyle, ViewStyle } from "react-native";
import { Image, ImageContentFit } from "expo-image";
import { colors } from "../theme/colors";
import { YoRHaLogo } from "./YoRHaLogo";

interface YoRHaImageProps {
  source?: { uri: string } | number;
  fallback?: "logo" | "none";
  style?: ImageStyle | ViewStyle | any;
  resizeMode?: ImageContentFit;
  size?: number;
}

export const YoRHaImage: React.FC<YoRHaImageProps> = ({
  source,
  fallback = "logo",
  style,
  resizeMode = "cover",
  size,
}) => {
  if (source) {
    return (
      <Image
        source={source}
        style={[
          styles.image,
          size ? { width: size, height: size } : undefined,
          style as ImageStyle,
        ]}
        contentFit={resizeMode}
        transition={200}
        placeholderContentFit="cover"
      />
    );
  }

  if (fallback === "logo") {
    return (
      <View
        style={[
          styles.fallbackContainer,
          size ? { width: size, height: size } : undefined,
          style as ViewStyle,
        ]}
      >
        <YoRHaLogo size={size || 60} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.placeholder,
        size ? { width: size, height: size } : undefined,
        style as ViewStyle,
      ]}
    >
      <View style={styles.placeholderInner} />
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    borderRadius: 8,
  },
  fallbackContainer: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderInner: {
    width: "60%",
    height: "60%",
    backgroundColor: colors.surfaceHigh,
    borderRadius: 4,
  },
});
