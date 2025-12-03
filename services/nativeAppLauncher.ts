import { NativeModules, Platform } from 'react-native';

const { AppLauncherModule } = NativeModules;

interface AppLauncherModuleInterface {
  launchApp(packageName: string): Promise<boolean>;
}

export const nativeAppLauncher = {
  async launchApp(packageName: string): Promise<{ success: boolean; error?: string }> {
    if (Platform.OS !== 'android') {
      return { success: false, error: 'Native app launcher is only available on Android.' };
    }

    if (!AppLauncherModule) {
      console.warn('AppLauncherModule not found - native module not loaded. Rebuild required.');
      return { 
        success: false, 
        error: 'Native module not loaded. You MUST rebuild the app: npx expo run:android (not just reload)' 
      };
    }
    
    console.log('Using native AppLauncherModule for:', packageName);

    try {
      await (AppLauncherModule as AppLauncherModuleInterface).launchApp(packageName);
      return { success: true };
    } catch (error: any) {
      const errorCode = error?.code || '';
      const errorMessage = error?.message || String(error);
      
      // Check error code first (more reliable)
      if (errorCode === 'SECURITY_ERROR' || errorMessage.includes('SECURITY_ERROR') || errorMessage.includes('SecurityException')) {
        return { 
          success: false, 
          error: 'This app is protected by Android and cannot be launched externally. This is a security restriction, not a bug.' 
        };
      }
      
      if (errorCode === 'APP_NOT_FOUND' || errorMessage.includes('APP_NOT_FOUND')) {
        return { 
          success: false, 
          error: 'Application not found.' 
        };
      }
      
      if (errorCode === 'NO_LAUNCHER' || errorMessage.includes('NO_LAUNCHER')) {
        return { 
          success: false, 
          error: 'This app does not have a launchable activity.' 
        };
      }
      
      return { 
        success: false, 
        error: errorMessage || 'Failed to launch application.' 
      };
    }
  },
};

