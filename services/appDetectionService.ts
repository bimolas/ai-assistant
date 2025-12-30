import * as Application from "expo-application";
import { Platform, Linking, NativeModules } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import { getInstalledApps } from "@zecky-dev/react-native-app-list";
import { nativeAppLauncher } from "./nativeAppLauncher";

export interface InstalledApp {
  packageName: string;
  appName: string;
  version?: string;
  icon?: string;
  isSystemApp?: boolean;
  mainActivity?: string; 
}

class AppDetectionService {
  private static instance: AppDetectionService;
  private appsCache: InstalledApp[] = [];
  private iconCache: Map<string, string | null> = new Map();

  static getInstance(): AppDetectionService {
    if (!AppDetectionService.instance) {
      AppDetectionService.instance = new AppDetectionService();
    }
    return AppDetectionService.instance;
  }

  async getInstalledApps(): Promise<InstalledApp[]> {
    if (this.appsCache.length > 0) {
      return this.appsCache;
    }

    try {
      if (Platform.OS === "android") {
        const installedApps = await getInstalledApps();

        this.appsCache = installedApps.map((app: any) => {
          const packageName = app.packageName || app.package || "unknown";
          const isSystem = this.isSystemApp(packageName);

          return {
            packageName: packageName,
            appName: app.appName || app.name || "Unknown App",
            version: app.version || undefined,
            icon: app.icon || undefined,
            isSystemApp: isSystem,
          };
        });

        this.appsCache.sort((a, b) => {
          if (a.isSystemApp !== b.isSystemApp) {
            return a.isSystemApp ? 1 : -1; 
          }
          return a.appName.localeCompare(b.appName);
        });

        return this.appsCache;
      } else {
        return [];
      }
    } catch (error) {
      console.error("Error detecting apps:", error);
      const appInfo = {
        packageName: Application.applicationId || "unknown",
        appName: Application.applicationName || "Unknown App",
        version: Application.nativeApplicationVersion || undefined,
      };
      this.appsCache = [appInfo];
      return this.appsCache;
    }
  }

  async launchApp(
    packageName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (Platform.OS !== "android") {
        return {
          success: false,
          error: "App launching is only supported on Android.",
        };
      }

      try {
        const attemptActivityNames = [
          "",
          this.guessMainActivity(packageName),
          ...this.getAllActivityPatterns(packageName),
        ];

        for (const activityName of attemptActivityNames) {
          try {
            const result = await nativeAppLauncher.launchApp(
              packageName,
              activityName || undefined
            );
            if (result.success) {
              return result;
            }

            const errLower = (result.error || "").toLowerCase();
            if (
              errLower.includes("security") ||
              errLower.includes("protected")
            ) {
              return result;
            }

            if (
              (result.error || "").includes("not loaded") ||
              (result.error || "").includes("rebuild")
            ) {
              break; 
            }

          } catch (errInner: any) {
            console.warn(
              "Native launcher threw, falling back to IntentLauncher:",
              errInner?.message
            );
            break;
          }
        }
      } catch (nativeError: any) {
        console.warn(
          "Native launcher error, using fallback:",
          nativeError?.message
        );
      }

      try {
        if (packageName === "com.android.settings") {
          await IntentLauncher.startActivityAsync("android.settings.SETTINGS");
        } else {
          await IntentLauncher.startActivityAsync(
            "android.intent.action.MAIN",
            { package: packageName } as any
          );
        }
        return { success: true };
      } catch (error: any) {
        const errorMsg = error?.message || String(error);

        if (
          errorMsg.includes("SecurityException") ||
          errorMsg.includes("Permission Denial")
        ) {
          return {
            success: false,
            error:
              "This app cannot be launched due to Android security restrictions.",
          };
        }

        try {
          await Linking.openURL(
            `intent://#Intent;action=android.intent.action.MAIN;package=${packageName};end`
          );
          return { success: true };
        } catch (err3: any) {
          return {
            success: false,
            error:
              "Unable to launch application. Please rebuild the app to enable native launcher.",
          };
        }
      }
    } catch (error: any) {
      console.error("Error launching app:", error);
      return {
        success: false,
        error: error?.message || "An unexpected error occurred.",
      };
    }
  }

  private guessMainActivity(packageName: string): string {
    return `${packageName}.MainActivity`;
  }

  private getAllActivityPatterns(packageName: string): string[] {
    const patterns = [
      ".MainActivity",
      ".ui.MainActivity",
      ".activities.MainActivity",
      ".Main",
      ".SplashActivity",
      ".LauncherActivity",
      ".HomeActivity",
      ".StartActivity",
    ];

    return patterns.map((pattern) => `${packageName}${pattern}`);
  }

  private isSystemApp(packageName: string): boolean {
  
    const coreSystemPatterns = [
      "android.",
      "com.android.settings",
      "com.android.systemui",
      "com.android.providers.",
      "com.android.server.",
    ];

    const isCoreSystem = coreSystemPatterns.some((pattern) =>
      packageName.startsWith(pattern)
    );
    return isCoreSystem;
  }

  async getAppInfo(packageName: string): Promise<InstalledApp | null> {
    const apps = await this.getInstalledApps();
    return apps.find((app) => app.packageName === packageName) || null;
  }

  async getAppIcon(packageName: string): Promise<string | null> {
    try {
      const cached = this.iconCache.get(packageName);
      if (cached !== undefined) return cached;

      const hasNative = !!(
        NativeModules &&
        NativeModules.AppIcon &&
        NativeModules.AppIcon.getAppIcon
      );
      console.debug(
        `[AppDetectionService] getAppIcon: native module available = ${hasNative}`
      );

      if (!hasNative) {
        this.iconCache.set(packageName, null);
        return null;
      }

      const res = await NativeModules.AppIcon.getAppIcon(packageName);
      console.debug(
        `[AppDetectionService] getAppIcon result for ${packageName}:`,
        res ? "<data>" : null
      );
      const uri = typeof res === "string" ? res : null;
      this.iconCache.set(packageName, uri);
      return uri;
    } catch (err) {
      console.warn("getAppIcon error:", err);
      this.iconCache.set(packageName, null);
      return null;
    }
  }

  async searchApps(query: string): Promise<InstalledApp[]> {
    const apps = await this.getInstalledApps();
    const lowerQuery = query.toLowerCase();
    return apps.filter(
      (app) =>
        app.appName.toLowerCase().includes(lowerQuery) ||
        app.packageName.toLowerCase().includes(lowerQuery)
    );
  }

  clearCache() {
    this.appsCache = [];
  }
}

export const appDetectionService = AppDetectionService.getInstance();
