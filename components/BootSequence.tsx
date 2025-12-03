import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';

const { width, height } = Dimensions.get('window');

interface BootSequenceProps {
  onComplete: () => void;
}

const bootMessages = [
  { text: 'INITIALIZING SYSTEM...', delay: 0 },
  { text: 'CONNECTING TO BUNKER...', delay: 400 },
  { text: 'LOADING COMBAT PROTOCOLS...', delay: 800 },
  { text: 'SYNCING MEMORY DATA...', delay: 1200 },
  { text: 'ESTABLISHING POD LINK...', delay: 1600 },
  { text: 'VERIFYING UNIT IDENTITY...', delay: 2000 },
  { text: 'UNIT 2B: AUTHORIZED', delay: 2400 },
  { text: 'ALL SYSTEMS OPERATIONAL', delay: 2800 },
];

export const BootSequence: React.FC<BootSequenceProps> = ({ onComplete }) => {
  const [visibleMessages, setVisibleMessages] = useState<number[]>([]);
  const [showLogo, setShowLogo] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const logoScale = useRef(new Animated.Value(0)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const welcomeOpacity = useRef(new Animated.Value(0)).current;
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const gridOpacity = useRef(new Animated.Value(0)).current;
  const hexagonRotate = useRef(new Animated.Value(0)).current;
  const messageOpacities = useRef(bootMessages.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    // Start scan line animation
    Animated.loop(
      Animated.timing(scanLineAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Hexagon rotation
    Animated.loop(
      Animated.timing(hexagonRotate, {
        toValue: 1,
        duration: 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Grid fade in
    Animated.timing(gridOpacity, {
      toValue: 0.15,
      duration: 500,
      useNativeDriver: true,
    }).start();

    // Show messages one by one - smooth fade in
    bootMessages.forEach((msg, index) => {
      setTimeout(() => {
        setVisibleMessages(prev => [...prev, index]);
        // Smooth fade in animation
        Animated.timing(messageOpacities[index], {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }).start();
      }, msg.delay);
    });

    // Progress bar animation - smoother
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 3200,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();

    // Show logo after messages
    setTimeout(() => {
      setShowLogo(true);
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1,
          tension: 50,
          friction: 10,
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 800,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }, 3400);

    // Show welcome message
    setTimeout(() => {
      setShowWelcome(true);
      Animated.timing(welcomeOpacity, {
        toValue: 1,
        duration: 1000,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    }, 4000);

    // Smooth fade out and complete
    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 1000,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start(() => {
        onComplete();
      });
    }, 6500); // Extended by 1.5 seconds to show credits longer
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Background gradient */}
      <LinearGradient
        colors={[colors.brownDark, '#2A2420', colors.brownDark]}
        style={StyleSheet.absoluteFill}
      />

      {/* Animated grid background */}
      <Animated.View style={[styles.gridContainer, { opacity: gridOpacity }]}>
        {[...Array(20)].map((_, i) => (
          <View key={`h${i}`} style={[styles.gridLine, { top: i * (height / 20) }]} />
        ))}
        {[...Array(10)].map((_, i) => (
          <View key={`v${i}`} style={[styles.gridLineV, { left: i * (width / 10) }]} />
        ))}
      </Animated.View>

      {/* Rotating hexagon decoration */}
      <Animated.View
        style={[
          styles.hexagonContainer,
          {
            transform: [
              {
                rotate: hexagonRotate.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
          },
        ]}
      >
        <View style={styles.hexagon} />
      </Animated.View>

      {/* Scan lines overlay */}
      <View style={styles.scanLinesContainer} pointerEvents="none">
        {[...Array(100)].map((_, i) => (
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
                  outputRange: [-50, height + 50],
                }),
              },
            ],
          },
        ]}
      />


      {/* Top corner decorations */}
      <View style={styles.cornerTL}>
        <View style={styles.cornerBracket} />
        <Text style={styles.cornerText}>YoRHa</Text>
      </View>
      <View style={styles.cornerTR}>
        <Text style={styles.cornerText}>BUNKER</Text>
        <View style={[styles.cornerBracket, styles.cornerBracketRight]} />
      </View>

      {/* Main content */}
      <View style={styles.content}>
        {/* Boot messages */}
        <View style={styles.messagesContainer}>
          {bootMessages.map((msg, index) => (
            <Animated.View
              key={index}
              style={[
                styles.messageRow,
                {
                  opacity: messageOpacities[index],
                },
              ]}
            >
              <Text style={styles.messagePrefix}>&gt;</Text>
              <Text style={styles.messageText}>{msg.text}</Text>
              {index === bootMessages.length - 1 && visibleMessages.includes(index) && (
                <View style={styles.successIndicator} />
              )}
            </Animated.View>
          ))}
        </View>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
          </View>
          <Text style={styles.progressText}>SYSTEM INITIALIZATION</Text>
        </View>

        {/* Creator Credit */}
        {showLogo && (
          <Animated.View
            style={[
              styles.creditContainer,
              {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }],
              },
            ]}
          >
            <View style={styles.creditLine} />
            <Text style={styles.creditLabel}>DEVELOPED BY</Text>
            <Text style={styles.creditName}>TAHA TAHIR</Text>
            <View style={styles.creditDivider}>
              <View style={styles.creditDividerLine} />
              <Text style={styles.creditDividerText}>◆</Text>
              <View style={styles.creditDividerLine} />
            </View>
            <Text style={styles.schoolLabel}>STUDENT AT</Text>
            <Text style={styles.schoolName}>L'EMSI</Text>
            <Text style={styles.schoolFull}>École Marocaine des Sciences de l'Ingénieur</Text>
            <View style={styles.creditLine} />
          </Animated.View>
        )}

        {/* Welcome message */}
        {showWelcome && (
          <Animated.View style={[styles.welcomeContainer, { opacity: welcomeOpacity }]}>
            <Text style={styles.welcomeText}>WELCOME TO</Text>
            <Text style={styles.welcomeTitle}>YoRHa HEADQUARTERS</Text>
            <Text style={styles.welcomeSubtitle}>Glory to Mankind</Text>
          </Animated.View>
        )}
      </View>

      {/* Bottom decorations */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomLine} />
        <Text style={styles.bottomText}>ANDROID INTERFACE v2.0</Text>
        <View style={styles.bottomLine} />
      </View>

      {/* Status indicators */}
      <View style={styles.statusContainer}>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, styles.statusActive]} />
          <Text style={styles.statusText}>ONLINE</Text>
        </View>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, styles.statusActive]} />
          <Text style={styles.statusText}>POD SYNC</Text>
        </View>
        <View style={styles.statusItem}>
          <View style={[styles.statusDot, styles.statusActive]} />
          <Text style={styles.statusText}>SECURE</Text>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
  },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.beigeLight,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: colors.beigeLight,
  },
  hexagonContainer: {
    position: 'absolute',
    width: 300,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.1,
  },
  hexagon: {
    width: 200,
    height: 200,
    borderWidth: 2,
    borderColor: colors.beigeLight,
    transform: [{ rotate: '45deg' }],
  },
  scanLinesContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  scanLine: {
    height: 2,
    backgroundColor: 'rgba(195, 189, 168, 0.02)',
    marginBottom: 2,
  },
  movingScanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: colors.accent,
    opacity: 0.6,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 10,
  },
  cornerTL: {
    position: 'absolute',
    top: 50,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cornerTR: {
    position: 'absolute',
    top: 50,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cornerBracket: {
    width: 20,
    height: 20,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderColor: colors.beigeLight,
    marginRight: 10,
  },
  cornerBracketRight: {
    borderLeftWidth: 0,
    borderRightWidth: 2,
    marginRight: 0,
    marginLeft: 10,
  },
  cornerText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: colors.beigeLight,
    letterSpacing: 2,
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  messagesContainer: {
    width: '100%',
    marginBottom: 30,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  messagePrefix: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: colors.accent,
    marginRight: 8,
  },
  messageText: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: colors.beigeLight,
    letterSpacing: 1,
    flex: 1,
  },
  successIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7A9B7A',
    marginLeft: 10,
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: 40,
  },
  progressTrack: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(195, 189, 168, 0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  progressText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.beigeLight,
    letterSpacing: 2,
    marginTop: 8,
    opacity: 0.7,
  },
  creditContainer: {
    alignItems: 'center',
    marginBottom: 24,
    paddingVertical: 20,
    paddingHorizontal: 30,
  },
  creditLine: {
    width: 60,
    height: 2,
    backgroundColor: colors.accent,
    opacity: 0.6,
    marginVertical: 12,
  },
  creditLabel: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.beigeLight,
    letterSpacing: 3,
    opacity: 0.6,
  },
  creditName: {
    fontFamily: 'monospace',
    fontSize: 28,
    fontWeight: '700',
    color: colors.beigeLight,
    letterSpacing: 4,
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  creditDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  creditDividerLine: {
    width: 30,
    height: 1,
    backgroundColor: colors.beigeLight,
    opacity: 0.4,
  },
  creditDividerText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.accent,
    marginHorizontal: 10,
  },
  schoolLabel: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.beigeLight,
    letterSpacing: 3,
    opacity: 0.6,
  },
  schoolName: {
    fontFamily: 'monospace',
    fontSize: 22,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 3,
    marginTop: 4,
  },
  schoolFull: {
    fontFamily: 'monospace',
    fontSize: 9,
    color: colors.beigeLight,
    letterSpacing: 1,
    marginTop: 4,
    opacity: 0.7,
    textAlign: 'center',
  },
  welcomeContainer: {
    alignItems: 'center',
  },
  welcomeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: colors.beigeLight,
    letterSpacing: 4,
    opacity: 0.8,
  },
  welcomeTitle: {
    fontFamily: 'monospace',
    fontSize: 24,
    fontWeight: '700',
    color: colors.beigeLight,
    letterSpacing: 4,
    marginTop: 8,
  },
  welcomeSubtitle: {
    fontFamily: 'monospace',
    fontSize: 14,
    color: colors.accent,
    letterSpacing: 2,
    marginTop: 12,
    fontStyle: 'italic',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 80,
    left: 30,
    right: 30,
    flexDirection: 'row',
    alignItems: 'center',
  },
  bottomLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.beigeLight,
    opacity: 0.3,
  },
  bottomText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.beigeLight,
    letterSpacing: 2,
    marginHorizontal: 15,
    opacity: 0.5,
  },
  statusContainer: {
    position: 'absolute',
    bottom: 40,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 15,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusActive: {
    backgroundColor: '#7A9B7A',
  },
  statusText: {
    fontFamily: 'monospace',
    fontSize: 10,
    color: colors.beigeLight,
    letterSpacing: 1,
    opacity: 0.7,
  },
});

