import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

const { width } = Dimensions.get('window');

interface NavItem {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface FuturisticNavBarProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

const navItems: NavItem[] = [
  { name: 'Home', label: 'HOME', icon: 'home' },
  { name: 'Tasks', label: 'TASKS', icon: 'list' },
  { name: 'Voice', label: 'VOICE', icon: 'mic' },
  { name: 'Profile', label: 'PROFILE', icon: 'person' },
];

const NavItemComponent: React.FC<{
  item: NavItem;
  isActive: boolean;
  itemWidth: number;
  pulseAnim: Animated.Value;
  onPress: () => void;
}> = ({ item, isActive, itemWidth, pulseAnim, onPress }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isActive) {
      Animated.spring(scaleAnim, {
        toValue: 1.15,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }).start();
    } else {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 300,
        friction: 10,
      }).start();
    }
  }, [isActive]);

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.navItem, { width: itemWidth }]}
      activeOpacity={0.7}
    >
      {/* Active indicator line */}
      {isActive && (
        <Animated.View
          style={[
            styles.activeIndicator,
            {
              transform: [{ scaleY: scaleAnim }],
            },
          ]}
        />
      )}
      
      {/* Icon container */}
      <Animated.View
        style={[
          styles.iconContainer,
          {
            transform: [{ scale: isActive ? scaleAnim : 1 }],
          },
        ]}
      >
        {isActive ? (
          <LinearGradient
            colors={[colors.brownDark, colors.brownMedium]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.iconGradient}
          >
            <Ionicons name={item.icon} size={24} color={colors.beigeLight} />
          </LinearGradient>
        ) : (
          <Ionicons name={item.icon} size={24} color={colors.textTertiary} />
        )}
      </Animated.View>
      
      {/* Label */}
      <Text
        style={[
          styles.label,
          isActive && styles.labelActive,
        ]}
      >
        {item.label}
      </Text>
      
      {/* Scanning line effect for active item */}
      {isActive && (
        <Animated.View
          style={[
            styles.scanLine,
            {
              transform: [
                {
                  translateY: pulseAnim.interpolate({
                    inputRange: [1, 1.1],
                    outputRange: [-10, 10],
                  }),
                },
              ],
            },
          ]}
        />
      )}
    </TouchableOpacity>
  );
};

export const FuturisticNavBar: React.FC<FuturisticNavBarProps> = ({
  currentRoute,
  onNavigate,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    // Continuous pulse animation
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    );

    // Glow animation
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 0.6,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );

    pulse.start();
    glow.start();

    return () => {
      pulse.stop();
      glow.stop();
    };
  }, []);

  const itemWidth = width / navItems.length;

  return (
    <View style={styles.container}>
      {/* Animated background glow */}
      <Animated.View
        style={[
          styles.glowBackground,
          {
            opacity: glowAnim,
          },
        ]}
      />
      
      {/* Top border line */}
      <View style={styles.topBorder} />
      
      {/* Navigation items */}
      <View style={styles.navItemsContainer}>
        {navItems.map((item) => (
          <NavItemComponent
            key={item.name}
            item={item}
            isActive={currentRoute === item.name}
            itemWidth={itemWidth}
            pulseAnim={pulseAnim}
            onPress={() => onNavigate(item.name)}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.surface,
    borderTopWidth: 2,
    borderTopColor: colors.brownDark,
    paddingBottom: 20,
    paddingTop: 12,
    shadowColor: colors.brownDark,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  glowBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.brownDark,
  },
  topBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.accent,
    opacity: 0.5,
  },
  navItemsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    paddingVertical: 8,
  },
  activeIndicator: {
    position: 'absolute',
    top: 0,
    left: '20%',
    right: '20%',
    height: 3,
    backgroundColor: colors.accent,
    borderRadius: 2,
  },
  iconContainer: {
    marginBottom: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  iconGradient: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    ...typography.label,
    fontSize: 10,
    color: colors.textTertiary,
    letterSpacing: 1,
  },
  labelActive: {
    color: colors.brownDark,
    fontWeight: '700',
  },
  scanLine: {
    position: 'absolute',
    left: '10%',
    right: '10%',
    height: 1,
    backgroundColor: colors.accent,
    opacity: 0.6,
  },
});
