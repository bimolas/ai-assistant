import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { View, StyleSheet } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colors } from "./theme/colors";
import { HomeScreen } from "./screens/HomeScreen";
import { TasksScreen } from "./screens/TasksScreen";
import { VoiceScreen } from "./screens/VoiceScreen";
import { VoiceAssistantScreen } from "./screens/VoiceAssistantScreen";
import { AppsScreen } from "./screens/AppsScreen";
import { ProfileScreen } from "./screens/ProfileScreen";
import { PodNavigation } from "./components/PodNavigation";
import { BootSequence } from "./components/BootSequence";
import { voiceService } from "./services/voiceService";

export default function App() {
  const [currentRoute, setCurrentRoute] = useState("Home");
  const [isBooting, setIsBooting] = useState(true);

 

  const renderScreen = () => {
    switch (currentRoute) {
      case "Home":
        return <HomeScreen />;
      case "Tasks":
        return <TasksScreen />;
      case "Voice":
        return <VoiceScreen />;
      case "Assistant":
        return <VoiceAssistantScreen />;
      case "Apps":
        return <AppsScreen />;
      case "Profile":
        return <ProfileScreen />;
      default:
        return <HomeScreen />;
    }
  };

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {renderScreen()}
        <PodNavigation
          currentRoute={currentRoute}
          onNavigate={setCurrentRoute}
        />
        {isBooting && <BootSequence onComplete={() => setIsBooting(false)} />}
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
