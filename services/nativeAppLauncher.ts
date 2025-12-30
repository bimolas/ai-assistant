import { NativeModules, Platform } from "react-native";

const { LauncherModule, AppLauncherModule } = NativeModules as any;

export const nativeAppLauncher = {
 
  async launchApp(
    packageName: string,
    activityName?: string
  ): Promise<{ success: boolean; error?: string }> {
    console.log("LauncherModule:", NativeModules.LauncherModule);

    if (Platform.OS !== "android") {
      return {
        success: false,
        error: "Native app launcher is only available on Android.",
      };
    }

    const nativeModule = LauncherModule || AppLauncherModule || null;
    if (!nativeModule) {
      console.warn(
        "LauncherModule not found - native module not loaded. Rebuild required."
      );
      return {
        success: false,
        error:
          "Native module not loaded. You MUST rebuild the app: npx expo run:android (not just reload)",
      };
    }

    try {
    
      const activityArg = activityName || "";
      await nativeModule.launchApp(packageName, activityArg);
      return { success: true };
    } catch (error: any) {
      const errorCode = error?.code || "";
      const errorMessage = error?.message || String(error || "");

      if (
        errorCode === "SECURITY_ERROR" ||
        errorMessage.includes("SecurityException") ||
        errorMessage.includes("SECURITY_ERROR")
      ) {
        return {
          success: false,
          error:
            "This app is protected by Android and cannot be launched externally. This is a security restriction.",
        };
      }

      if (
        errorCode === "APP_NOT_FOUND" ||
        errorMessage.includes("APP_NOT_FOUND") ||
        errorMessage.includes("ActivityNotFoundException")
      ) {
        return { success: false, error: "Application or activity not found." };
      }

      if (errorCode === "NO_LAUNCHER" || errorMessage.includes("NO_LAUNCHER")) {
        return {
          success: false,
          error: "This app does not have a launchable activity.",
        };
      }

      return {
        success: false,
        error: errorMessage || "Failed to launch application.",
      };
    }
  },
};
