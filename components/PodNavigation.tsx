import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Easing,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "../theme/colors";

const { width, height } = Dimensions.get("window");

interface NavItem {
  name: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface PodNavigationProps {
  currentRoute: string;
  onNavigate: (route: string) => void;
}

const navItems: NavItem[] = [
  { name: "Home", label: "HOME", icon: "home" },
  { name: "Tasks", label: "TASKS", icon: "list" },
  { name: "Assistant", label: "2B AI", icon: "chatbubbles" },
  { name: "Apps", label: "APPS", icon: "apps" },
  { name: "History", label: "HISTORY", icon: "time" },
  { name: "Profile", label: "UNIT", icon: "person" },
];

export const PodNavigation: React.FC<PodNavigationProps> = ({
  currentRoute,
  onNavigate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const expandAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glitchAnim = useRef(new Animated.Value(0)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const itemAnims = useRef(navItems.map(() => new Animated.Value(0))).current;

  // Continuous pulse animation for the pod
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.08,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  // Scan line animation
  useEffect(() => {
    const scan = Animated.loop(
      Animated.timing(scanLineAnim, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    scan.start();
    return () => scan.stop();
  }, []);

  // Glitch effect
  useEffect(() => {
    const glitch = Animated.loop(
      Animated.sequence([
        Animated.delay(3000),
        Animated.timing(glitchAnim, {
          toValue: 1,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(glitchAnim, {
          toValue: 0,
          duration: 50,
          useNativeDriver: true,
        }),
        Animated.timing(glitchAnim, {
          toValue: 0.5,
          duration: 30,
          useNativeDriver: true,
        }),
        Animated.timing(glitchAnim, {
          toValue: 0,
          duration: 30,
          useNativeDriver: true,
        }),
      ])
    );
    glitch.start();
    return () => glitch.stop();
  }, []);

  const toggleMenu = () => {
    const toValue = isOpen ? 0 : 1;
    setIsOpen(!isOpen);

    // Main expand animation
    Animated.spring(expandAnim, {
      toValue,
      tension: 80,
      friction: 10,
      useNativeDriver: true,
    }).start();

    // Rotation animation
    Animated.timing(rotateAnim, {
      toValue,
      duration: 300,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    // Staggered item animations
    itemAnims.forEach((anim, index) => {
      Animated.timing(anim, {
        toValue,
        duration: 300,
        delay: isOpen ? 0 : index * 80,
        easing: Easing.out(Easing.back(1.5)),
        useNativeDriver: true,
      }).start();
    });
  };

  const handleNavigate = (route: string) => {
    onNavigate(route);
    toggleMenu();
  };

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "135deg"],
  });

  const menuScale = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });

  const backdropOpacity = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.7],
  });

  // Calculate positions in a circle
  const getItemPosition = (index: number) => {
    const angle = (index * (360 / navItems.length) - 90) * (Math.PI / 180);
    const radius = 130; // Increased radius for 5 items
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  };

  return (
    <>
      {/* Backdrop with scan lines */}
      <Animated.View
        style={[
          styles.backdrop,
          {
            opacity: backdropOpacity,
            pointerEvents: isOpen ? "auto" : "none",
          },
        ]}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={toggleMenu}
          activeOpacity={1}
        />

        {/* Scan lines overlay */}
        <View style={styles.scanLinesContainer} pointerEvents="none">
          {[...Array(20)].map((_, i) => (
            <View key={i} style={styles.scanLine} />
          ))}
        </View>

        {/* Moving scan line */}
        <Animated.View
          style={[
            styles.movingScanLine,
            {
              transform: [
                {
                  translateY: scanLineAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, height],
                  }),
                },
              ],
            },
          ]}
          pointerEvents="none"
        />
      </Animated.View>

      {/* Current route indicator */}
      <View style={styles.routeIndicator} pointerEvents="none">
        <Text style={styles.routeText}>[ {currentRoute.toUpperCase()} ]</Text>
        <Animated.View
          style={[
            styles.glitchOverlay,
            {
              opacity: glitchAnim,
              transform: [
                {
                  translateX: glitchAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0, -3, 3],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={[styles.routeText, styles.glitchText]}>
            [ {currentRoute.toUpperCase()} ]
          </Text>
        </Animated.View>
      </View>

      {/* Radial menu items */}
      <View
        style={styles.menuContainer}
        pointerEvents={isOpen ? "box-none" : "none"}
      >
        <Animated.View
          style={[
            styles.menuWrapper,
            {
              transform: [{ scale: menuScale }],
              opacity: expandAnim,
            },
          ]}
        >
          {/* Circular background */}
          <View style={styles.circularBg} />

          {/* Rotating ring */}
          <Animated.View
            style={[
              styles.rotatingRing,
              {
                transform: [
                  {
                    rotate: scanLineAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ["0deg", "360deg"],
                    }),
                  },
                ],
              },
            ]}
          />

          {navItems.map((item, index) => {
            const position = getItemPosition(index);
            const isActive = currentRoute === item.name;

            return (
              <Animated.View
                key={item.name}
                style={[
                  styles.menuItem,
                  {
                    transform: [
                      {
                        translateX: itemAnims[index].interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, position.x],
                        }),
                      },
                      {
                        translateY: itemAnims[index].interpolate({
                          inputRange: [0, 1],
                          outputRange: [0, position.y],
                        }),
                      },
                      {
                        scale: itemAnims[index].interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0.3, 1.2, 1],
                        }),
                      },
                    ],
                    opacity: itemAnims[index],
                  },
                ]}
              >
                <TouchableOpacity
                  onPress={() => handleNavigate(item.name)}
                  style={[
                    styles.menuItemButton,
                    isActive && styles.menuItemButtonActive,
                  ]}
                  activeOpacity={0.8}
                >
                  {isActive ? (
                    <LinearGradient
                      colors={[colors.accent, colors.accentDark]}
                      style={styles.menuItemGradient}
                    >
                      <Ionicons
                        name={item.icon}
                        size={26}
                        color={colors.surface}
                      />
                    </LinearGradient>
                  ) : (
                    <View style={styles.menuItemInner}>
                      <Ionicons
                        name={item.icon}
                        size={26}
                        color={colors.brownDark}
                      />
                    </View>
                  )}
                </TouchableOpacity>
                <Text
                  style={[
                    styles.menuItemLabel,
                    isActive && styles.menuItemLabelActive,
                  ]}
                >
                  {item.label}
                </Text>
              </Animated.View>
            );
          })}
        </Animated.View>
      </View>

      {/* Main Pod Button */}
      <Animated.View
        style={[
          styles.podContainer,
          {
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        {/* Outer ring */}
        <View style={styles.podOuterRing} />

        <TouchableOpacity
          onPress={toggleMenu}
          style={styles.podButton}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={[colors.brownMedium, colors.brownDark]}
            style={styles.podGradient}
          >
            <Animated.View style={{ transform: [{ rotate: rotation }] }}>
              <Ionicons name="add" size={32} color={colors.beigeLight} />
            </Animated.View>
          </LinearGradient>
        </TouchableOpacity>

        {/* Pod label */}
        <View style={styles.podLabel}>
          <Text style={styles.podLabelText}>POD</Text>
        </View>
      </Animated.View>

      {/* Corner decorations */}
      <View style={styles.cornerTL}>
        <View style={styles.cornerLine} />
        <View style={[styles.cornerLine, styles.cornerLineV]} />
      </View>
      <View style={styles.cornerTR}>
        <View style={styles.cornerLine} />
        <View style={[styles.cornerLine, styles.cornerLineV]} />
      </View>
      <View style={styles.cornerBL}>
        <View style={styles.cornerLine} />
        <View style={[styles.cornerLine, styles.cornerLineV]} />
      </View>
      <View style={styles.cornerBR}>
        <View style={styles.cornerLine} />
        <View style={[styles.cornerLine, styles.cornerLineV]} />
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.brownDark,
    zIndex: 100,
  },
  scanLinesContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  scanLine: {
    height: 2,
    backgroundColor: "rgba(176, 171, 152, 0.03)",
    marginBottom: 4,
  },
  movingScanLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.accent,
    opacity: 0.3,
  },
  routeIndicator: {
    position: "absolute",
    top: 55,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 10,
    height: 40,
  },
  routeText: {
    fontFamily: "monospace",
    fontSize: 24,
    fontWeight: "700",
    color: colors.brownDark,
    letterSpacing: 4,
    textShadowColor: "rgba(75, 65, 61, 0.3)",
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  glitchOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  glitchText: {
    color: colors.accent,
  },
  menuContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 101,
  },
  menuWrapper: {
    width: 320,
    height: 320,
    justifyContent: "center",
    alignItems: "center",
  },
  circularBg: {
    position: "absolute",
    width: 290,
    height: 290,
    borderRadius: 145,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.brownDark,
    opacity: 0.95,
  },
  rotatingRing: {
    position: "absolute",
    width: 310,
    height: 310,
    borderRadius: 155,
    borderWidth: 1,
    borderColor: colors.accent,
    borderStyle: "dashed",
    opacity: 0.5,
  },
  menuItem: {
    position: "absolute",
    alignItems: "center",
  },
  menuItemButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: colors.brownDark,
    backgroundColor: colors.surface,
  },
  menuItemButtonActive: {
    borderColor: colors.accent,
  },
  menuItemGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  menuItemInner: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  menuItemLabel: {
    marginTop: 6,
    fontSize: 10,
    fontFamily: "monospace",
    color: colors.textSecondary,
    letterSpacing: 1,
  },
  menuItemLabelActive: {
    color: colors.brownDark,
    fontWeight: "700",
  },
  podContainer: {
    position: "absolute",
    bottom: 20,
    right: 30,
    zIndex: 102,
    alignItems: "center",
  },
  podOuterRing: {
    position: "absolute",
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: colors.brownDark,
    opacity: 0.5,
  },
  podButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: "hidden",
    shadowColor: colors.brownDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  podGradient: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  podLabel: {
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.brownDark,
  },
  podLabelText: {
    fontSize: 10,
    fontFamily: "monospace",
    color: colors.brownDark,
    letterSpacing: 2,
  },
  // Corner decorations
  cornerTL: {
    position: "absolute",
    top: 50,
    left: 10,
    zIndex: 10,
  },
  cornerTR: {
    position: "absolute",
    top: 50,
    right: 10,
    transform: [{ rotate: "90deg" }],
    zIndex: 10,
  },
  cornerBL: {
    position: "absolute",
    bottom: 10,
    left: 10,
    transform: [{ rotate: "-90deg" }],
    zIndex: 10,
  },
  cornerBR: {
    position: "absolute",
    bottom: 10,
    right: 10,
    transform: [{ rotate: "180deg" }],
    zIndex: 10,
  },
  cornerLine: {
    width: 20,
    height: 2,
    backgroundColor: colors.brownDark,
    opacity: 0.4,
  },
  cornerLineV: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 2,
    height: 20,
  },
});
