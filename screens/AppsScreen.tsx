import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { YoRHaCard } from "../components/YoRHaCard";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import {
  appDetectionService,
  InstalledApp,
} from "../services/appDetectionService";

export const AppsScreen: React.FC = () => {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [filteredApps, setFilteredApps] = useState<InstalledApp[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadApps();
  }, []);

  const loadApps = async () => {
    try {
      setLoading(true);
      setError(null);
      const installedApps = await appDetectionService.getInstalledApps();
      setApps(installedApps);
      setFilteredApps(installedApps);
    } catch (err) {
      setError("Failed to load applications");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchQuery.trim()) {
      const filtered = apps.filter(
        (app) =>
          app.appName.toLowerCase().includes(searchQuery.toLowerCase()) ||
          app.packageName.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredApps(filtered);
    } else {
      setFilteredApps(apps);
    }
  }, [searchQuery, apps]);

  const handleLaunchApp = async (app: InstalledApp) => {
    try {
      const result = await appDetectionService.launchApp(app.packageName);
      if (!result.success) {
        // Error is already logged and handled in the service
        // Could show a toast or alert here if needed
        console.warn(`Failed to launch ${app.appName}:`, result.error);
      }
    } catch (err) {
      console.error("Failed to launch app:", err);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.spacer} />

        <YoRHaCard elevated style={styles.headerCard}>
          <Text style={styles.label}>INSTALLED APPLICATIONS</Text>
          <Text style={styles.subtitle}>
            {apps.length} application{apps.length !== 1 ? "s" : ""} detected
          </Text>
        </YoRHaCard>

        {!loading && apps.length > 0 && (
          <YoRHaCard style={styles.searchCard}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search apps..."
              placeholderTextColor={colors.textTertiary}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <Ionicons
              name="search"
              size={20}
              color={colors.textTertiary}
              style={styles.searchIcon}
            />
          </YoRHaCard>
        )}

        {loading ? (
          <YoRHaCard style={styles.loadingCard}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Scanning system...</Text>
          </YoRHaCard>
        ) : error ? (
          <YoRHaCard style={styles.errorCard}>
            <Ionicons name="alert-circle" size={32} color={colors.error} />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={loadApps} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </YoRHaCard>
        ) : filteredApps.length === 0 ? (
          <YoRHaCard style={styles.emptyCard}>
            <Ionicons name="search" size={48} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              {searchQuery
                ? "No apps found matching your search"
                : "No applications found"}
            </Text>
            {searchQuery && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                style={styles.clearButton}
              >
                <Text style={styles.clearButtonText}>Clear search</Text>
              </TouchableOpacity>
            )}
          </YoRHaCard>
        ) : (
          filteredApps.map((app) => (
            <AppRow
              key={app.packageName}
              app={app}
              onLaunch={handleLaunchApp}
            />
          ))
        )}

        <YoRHaCard style={styles.infoCard}>
          <Text style={styles.label}>SYSTEM NOTE</Text>
          <Text style={styles.infoText}>
            Full application detection requires additional Android permissions.
            Currently showing system information. To detect all installed apps,
            the app needs QUERY_ALL_PACKAGES permission (Android 11+).
          </Text>
        </YoRHaCard>
      </ScrollView>
    </SafeAreaView>
  );
};

const AppRow: React.FC<{
  app: InstalledApp;
  onLaunch: (a: InstalledApp) => void;
}> = ({ app, onLaunch }) => {
  const [iconUri, setIconUri] = useState<string | undefined | null>(app.icon);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        console.debug("[AppsScreen] loading native icon for", app.packageName);
        // Ask service for native cached icon; it will return cached value or null
        const nativeUri = await appDetectionService.getAppIcon(app.packageName);
        console.debug(
          "[AppsScreen] nativeUri for",
          app.packageName,
          nativeUri ? "<data>" : null
        );
        if (!mounted) return;
        if (nativeUri) {
          setIconUri(nativeUri);
        } else if (app.icon) {
          setIconUri(app.icon);
        } else {
          setIconUri(null);
        }
      } catch (err) {
        console.warn("Failed to load app icon for", app.packageName, err);
        if (mounted) setIconUri(app.icon ?? null);
      }
    };

    // Always try to load native icon (will be quick if cached)
    load();

    return () => {
      mounted = false;
    };
  }, [app.packageName]);

  return (
    <YoRHaCard style={styles.appCard}>
      <TouchableOpacity
        onPress={() => onLaunch(app)}
        style={styles.appRow}
        activeOpacity={0.7}
      >
        <View style={styles.appIcon}>
          {iconUri ? (
            <Image
              source={{ uri: iconUri }}
              style={{ width: 40, height: 40, borderRadius: 8 }}
              resizeMode="cover"
            />
          ) : (
            <Ionicons name="cube" size={32} color={colors.accent} />
          )}
        </View>
        <View style={styles.appInfo}>
          <Text style={styles.appName}>{app.appName}</Text>
          <Text style={styles.appPackage}>{app.packageName}</Text>
          {app.version && <Text style={styles.appVersion}>v{app.version}</Text>}
        </View>
        <Ionicons
          name="chevron-forward"
          size={20}
          color={colors.textTertiary}
        />
      </TouchableOpacity>
    </YoRHaCard>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  spacer: {
    height: 50,
  },
  headerCard: {
    marginBottom: 16,
  },
  searchCard: {
    marginBottom: 16,
    position: "relative",
  },
  searchInput: {
    ...typography.body,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 14,
    paddingRight: 40,
    color: colors.textPrimary,
  },
  searchIcon: {
    position: "absolute",
    right: 16,
    top: 16,
  },
  clearButton: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearButtonText: {
    ...typography.bodySmall,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  label: {
    ...typography.label,
    marginBottom: 8,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  loadingCard: {
    alignItems: "center",
    padding: 32,
    marginBottom: 16,
  },
  loadingText: {
    ...typography.body,
    marginTop: 16,
    color: colors.textSecondary,
  },
  errorCard: {
    alignItems: "center",
    padding: 32,
    marginBottom: 16,
  },
  errorText: {
    ...typography.body,
    marginTop: 16,
    color: colors.error,
    textAlign: "center",
  },
  retryButton: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: colors.surfaceElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  retryText: {
    ...typography.body,
    color: colors.textPrimary,
    fontWeight: "600",
  },
  emptyCard: {
    alignItems: "center",
    padding: 48,
    marginBottom: 16,
  },
  emptyText: {
    ...typography.body,
    marginTop: 16,
    color: colors.textPrimary,
  },
  emptySubtext: {
    ...typography.bodySmall,
    marginTop: 8,
    color: colors.textTertiary,
    textAlign: "center",
  },
  appCard: {
    marginBottom: 12,
  },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  appIcon: {
    width: 50,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.surfaceHigh,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  appInfo: {
    flex: 1,
  },
  appName: {
    ...typography.body,
    fontWeight: "600",
    color: colors.textPrimary,
    marginBottom: 4,
  },
  appPackage: {
    ...typography.bodySmall,
    color: colors.textTertiary,
    fontFamily: "monospace",
  },
  appVersion: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginTop: 2,
  },
  infoCard: {
    marginTop: 8,
  },
  infoText: {
    ...typography.body,
    lineHeight: 22,
    color: colors.textSecondary,
  },
});
