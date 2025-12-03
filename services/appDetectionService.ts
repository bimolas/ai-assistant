import * as Application from 'expo-application';
import { Platform, Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { getInstalledApps } from '@zecky-dev/react-native-app-list';
import { nativeAppLauncher } from './nativeAppLauncher';

export interface InstalledApp {
  packageName: string;
  appName: string;
  version?: string;
  icon?: string;
  isSystemApp?: boolean;
  mainActivity?: string; // Main launcher activity component name
}

class AppDetectionService {
  private static instance: AppDetectionService;
  private appsCache: InstalledApp[] = [];

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
      if (Platform.OS === 'android') {
        // Use the react-native-app-list package to get all installed apps
        const installedApps = await getInstalledApps();
        
        // Transform to our format
        this.appsCache = installedApps.map((app: any) => {
          const packageName = app.packageName || app.package || 'unknown';
          const isSystem = this.isSystemApp(packageName);
          
          return {
            packageName: packageName,
            appName: app.appName || app.name || 'Unknown App',
            version: app.version || undefined,
            icon: app.icon || undefined,
            isSystemApp: isSystem,
          };
        });

        // Sort: user apps first, then system apps, both alphabetically
        this.appsCache.sort((a, b) => {
          if (a.isSystemApp !== b.isSystemApp) {
            return a.isSystemApp ? 1 : -1; // User apps first
          }
          return a.appName.localeCompare(b.appName);
        });
        
        return this.appsCache;
      } else {
        // iOS doesn't allow querying installed apps
        return [];
      }
    } catch (error) {
      console.error('Error detecting apps:', error);
      // Fallback to current app info if detection fails
      const appInfo = {
        packageName: Application.applicationId || 'unknown',
        appName: Application.applicationName || 'Unknown App',
        version: Application.nativeApplicationVersion || undefined,
      };
      this.appsCache = [appInfo];
      return this.appsCache;
    }
  }

  async launchApp(packageName: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (Platform.OS !== 'android') {
        return { success: false, error: 'App launching is only supported on Android.' };
      }

      // METHOD 1: Use native module with getLaunchIntentForPackage (BEST - no picker, exact intent)
      try {
        const result = await nativeAppLauncher.launchApp(packageName);
        // If it succeeds, return immediately
        if (result.success) {
          return result;
        }
        // If it fails with security error, that's final - Android is blocking it
        if (result.error?.toLowerCase().includes('security') || result.error?.toLowerCase().includes('protected')) {
          return result;
        }
        // If native module says it's not available, try fallback
        if (result.error?.includes('not available') || result.error?.includes('rebuild')) {
          // Fall through to fallback methods
        } else {
          // Other errors from native module are final
          return result;
        }
      } catch (nativeError: any) {
        // Native module might not be available (needs rebuild), fall through to fallback
        console.warn('Native launcher error, using fallback:', nativeError?.message);
      }

      // METHOD 2: Fallback to IntentLauncher (may show picker)
      try {
        await IntentLauncher.startActivityAsync('android.intent.action.MAIN', {
          package: packageName,
        });
        return { success: true };
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        
        if (errorMsg.includes('SecurityException') || errorMsg.includes('Permission Denial')) {
          return { 
            success: false, 
            error: 'This app cannot be launched due to Android security restrictions.' 
          };
        }
        
        // Last resort
        try {
          await Linking.openURL(`intent://#Intent;action=android.intent.action.MAIN;package=${packageName};end`);
          return { success: true };
        } catch (err3: any) {
          return { 
            success: false, 
            error: 'Unable to launch application. Please rebuild the app to enable native launcher.' 
          };
        }
      }
    } catch (error: any) {
      console.error('Error launching app:', error);
      return { 
        success: false, 
        error: error?.message || 'An unexpected error occurred.' 
      };
    }
  }

  private guessMainActivity(packageName: string): string {
    // Return the most common pattern
    return `${packageName}.MainActivity`;
  }

  private getAllActivityPatterns(packageName: string): string[] {
    // Common main activity patterns - try the most common first
    const patterns = [
      '.MainActivity',
      '.ui.MainActivity', 
      '.activities.MainActivity',
      '.Main',
      '.SplashActivity',
      '.LauncherActivity',
      '.HomeActivity',
      '.StartActivity',
    ];
    
    return patterns.map(pattern => `${packageName}${pattern}`);
  }

  private isSystemApp(packageName: string): boolean {
    // Only block truly system-level apps, not manufacturer apps that users can launch
    // These are core Android system packages that should never be launched externally
    const coreSystemPatterns = [
      'android.',
      'com.android.settings', // Settings can be launched, but we'll allow it
      'com.android.systemui',
      'com.android.providers.',
      'com.android.server.',
    ];
    
    // Check if it's a core system package
    const isCoreSystem = coreSystemPatterns.some(pattern => packageName.startsWith(pattern));
    
    // For manufacturer apps (MIUI, Samsung, etc.), allow them - they might be launchable
    // Only block if Android itself blocks it with a SecurityException
    return isCoreSystem;
  }

  async getAppInfo(packageName: string): Promise<InstalledApp | null> {
    const apps = await this.getInstalledApps();
    return apps.find(app => app.packageName === packageName) || null;
  }

  async searchApps(query: string): Promise<InstalledApp[]> {
    const apps = await this.getInstalledApps();
    const lowerQuery = query.toLowerCase();
    return apps.filter(
      app =>
        app.appName.toLowerCase().includes(lowerQuery) ||
        app.packageName.toLowerCase().includes(lowerQuery)
    );
  }

  clearCache() {
    this.appsCache = [];
  }
}

export const appDetectionService = AppDetectionService.getInstance();
