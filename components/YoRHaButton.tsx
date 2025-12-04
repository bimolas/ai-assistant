import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";

interface YoRHaButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "outline";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

export const YoRHaButton: React.FC<YoRHaButtonProps> = ({
  title,
  onPress,
  variant = "primary",
  loading = false,
  disabled = false,
  style,
}) => {
  const isPrimary = variant === "primary";
  const isOutline = variant === "outline";

  if (isPrimary) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.8}
        style={[styles.button, disabled && styles.disabled, style]}
      >
        <LinearGradient
          colors={[colors.brownMedium, colors.brownDark]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradient}
        >
          {loading ? (
            <ActivityIndicator color={colors.textPrimary} />
          ) : (
            <Text style={styles.primaryText}>{title}</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  if (isOutline) {
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled || loading}
        activeOpacity={0.8}
        style={[styles.outlineButton, disabled && styles.disabled, style]}
      >
        {loading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <Text style={styles.outlineText}>{title}</Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[styles.secondaryButton, disabled && styles.disabled, style]}
    >
      {loading ? (
        <ActivityIndicator color={colors.textPrimary} />
      ) : (
        <Text style={styles.secondaryText}>{title}</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 8,
    shadowColor: colors.brownDark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
    width: "100%",
    minHeight: 48,
    justifyContent: "center", // ADDED: Center content
    alignSelf: "stretch",
  },
  gradient: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    borderRadius: 8,
  },
  primaryText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.beigeLight,
  },
  secondaryButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brownMedium,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  secondaryText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.brownDark,
  },
  outlineButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: colors.brownDark,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
  },
  outlineText: {
    ...typography.body,
    fontWeight: "600",
    color: colors.brownDark,
  },
  disabled: {
    opacity: 0.7,
  },
});
