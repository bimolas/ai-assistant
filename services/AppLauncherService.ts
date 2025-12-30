import { appDetectionService } from "./appDetectionService";
import { historyService } from "./historyService";

export class AppLauncherService {
  private onSpeak?: (text: string) => Promise<void>;
  private onStatusUpdate?: (message: string) => void;
  
  private APP_ALIASES: Record<string, string> = {
    youtube: "com.google.android.youtube",
    chrome: "com.android.chrome",
    google: "com.android.chrome",
    maps: "com.google.android.apps.maps",
    whatsapp: "com.whatsapp",
    instagram: "com.instagram.android",
    facebook: "com.facebook.katana",
    spotify: "com.spotify.music",
    gmail: "com.google.android.gm",
    camera: "com.android.camera",
    cam: "com.android.camera",
    "camera app": "com.android.camera",
    "google camera": "com.google.android.camera",
    "samsung camera": "com.samsung.android.camera",
    "miui camera": "com.miui.camera",
    "huawei camera": "com.huawei.camera",
  };

  constructor(
    onSpeak?: (text: string) => Promise<void>,
    onStatusUpdate?: (message: string) => void
  ) {
    this.onSpeak = onSpeak;
    this.onStatusUpdate = onStatusUpdate;
  }

  async handleAppLaunch(appName: string): Promise<any> {
    if (!appName || appName.trim() === "") {
      const msg = "Please specify an application name";
      this.onStatusUpdate?.(msg);
      await this.onSpeak?.(msg);
      return { success: false, message: msg };
    }
    
    this.onStatusUpdate?.(`Searching for ${appName}`);
    const apps = await appDetectionService.getInstalledApps();

    if (apps.length === 0) {
      const msg = "No applications detected. Please check app permissions.";
      await this.onSpeak?.(msg);
      return { success: false, message: msg };
    }

    const searchTerm = appName.toLowerCase().trim();

    const aliasKey = searchTerm.replace(/\s+/g, "");
    if (this.APP_ALIASES[aliasKey]) {
      const pkg = this.APP_ALIASES[aliasKey];
      this.onStatusUpdate?.(`Opening ${appName}`);
      await this.onSpeak?.(`Opening ${appName}`);
      const res = await appDetectionService.launchApp(pkg);
      if (res.success) {
        try {
          await historyService.add(`open ${appName}`);
        } catch {}
        return { success: true, message: `Launched ${appName}` };
      }
      return res;
    }

    for (const w of searchTerm.split(/\s+/)) {
      if (this.APP_ALIASES[w]) {
        const pkg = this.APP_ALIASES[w];
        this.onStatusUpdate?.(`Opening ${appName}`);
        await this.onSpeak?.(`Opening ${appName}`);
        const res = await appDetectionService.launchApp(pkg);
        if (res.success) {
          try {
            await historyService.add(`open ${appName}`);
          } catch {}
          return { success: true, message: `Launched ${appName}` };
        }
        return res;
      }
    }

    let matchingApp = apps.find(
      (app) => app.appName.toLowerCase() === searchTerm
    );

    if (!matchingApp) {
      matchingApp = apps.find((app) =>
        app.appName.toLowerCase().includes(searchTerm)
      );
    }

    if (!matchingApp) {
      matchingApp = apps.find((app) =>
        app.packageName.toLowerCase().includes(searchTerm)
      );
    }

    if (!matchingApp) {
      const searchWords = searchTerm.split(/\s+/);
      matchingApp = apps.find((app) => {
        const appNameLower = app.appName.toLowerCase();
        return searchWords.every((word) => appNameLower.includes(word));
      });
    }

    if (matchingApp) {
      const pkgLower = (matchingApp.packageName || "").toLowerCase();
      const askedSettings =
        searchTerm.includes("setting") || searchTerm.includes("settings");
      if (pkgLower.includes("settings") && !askedSettings) {
        // Skip settings apps if not explicitly requested
      } else {
        this.onStatusUpdate?.(`Opening ${matchingApp.appName}`);
        await this.onSpeak?.(`Opening ${matchingApp.appName}`);
        const result = await appDetectionService.launchApp(
          matchingApp.packageName
        );
        if (!result.success) {
          const errorMsg = result.error || "Unable to launch application";
          const fullMsg = `Failed to launch ${matchingApp.appName}: ${errorMsg}`;
          await this.onSpeak?.(`Failed to open ${matchingApp.appName}`);
          return { success: false, message: fullMsg };
        } else {
          const msg = `Successfully launched ${matchingApp.appName}`;
          try {
            await historyService.add(`open ${matchingApp.appName}`);
          } catch {}
          return { success: true, message: msg };
        }
      }
    } else {
      const { app: fuzzyApp, score } = this.findBestFuzzyApp(apps, searchTerm);
      const isCameraQuery = /\bcam|camera\b/.test(searchTerm);
      const threshold = isCameraQuery ? 0.5 : 0.6;
      if (fuzzyApp && score >= threshold) {
        this.onStatusUpdate?.(`Opening ${fuzzyApp.appName}`);
        await this.onSpeak?.(`Opening ${fuzzyApp.appName}`);
        const launchRes = await appDetectionService.launchApp(
          fuzzyApp.packageName
        );
        if (launchRes.success) {
          try {
            await historyService.add(`open ${fuzzyApp.appName}`);
          } catch {}
          return { success: true, message: `Launched ${fuzzyApp.appName}` };
        } else {
          await this.onSpeak?.(`Unable to open ${fuzzyApp.appName}`);
          return {
            success: false,
            message: launchRes.error || "Launch failed",
          };
        }
      }

      const similar = apps
        .filter((app) => {
          const appNameLower = app.appName.toLowerCase();
          return (
            appNameLower.includes(searchTerm.substring(0, 3)) ||
            searchTerm.includes(appNameLower.substring(0, 3))
          );
        })
        .slice(0, 3);

      if (similar.length > 0) {
        const suggestions = similar.map((app) => app.appName).join(", ");
        const msg = `Application "${appName}" not found. Did you mean: ${suggestions}?`;
        this.onStatusUpdate?.(msg);
        await this.onSpeak?.(
          `Application ${appName} not found. Did you mean: ${suggestions}?`
        );
        return { success: false, message: msg };
      } else {
        const msg = `Application "${appName}" not found. Use "list apps" to see available applications.`;
        this.onStatusUpdate?.(msg);
        await this.onSpeak?.(
          `Application ${appName} not found. Use "list apps" to see available applications.`
        );
        return { success: false, message: msg };
      }
    }
  }

  private levenshtein(a: string, b: string): number {
    const al = a.length;
    const bl = b.length;
    if (al === 0) return bl;
    if (bl === 0) return al;
    const matrix: number[][] = Array.from({ length: al + 1 }, () =>
      Array(bl + 1).fill(0)
    );
    for (let i = 0; i <= al; i++) matrix[i][0] = i;
    for (let j = 0; j <= bl; j++) matrix[0][j] = j;
    for (let i = 1; i <= al; i++) {
      for (let j = 1; j <= bl; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
    return matrix[al][bl];
  }

  private findBestFuzzyApp(
    apps: { appName: string; packageName: string }[],
    query: string
  ): { app: any | null; score: number } {
    const q = query.toLowerCase().trim();
    let best: any | null = null;
    let bestScore = 0;
    for (const app of apps) {
      const name = app.appName.toLowerCase();
      const pkg = app.packageName.toLowerCase();
      const maxLen = Math.max(name.length, q.length, 1);
      const d = this.levenshtein(name, q);
      const scoreName = 1 - d / maxLen; 

      const prefixScore = name.startsWith(q) || pkg.startsWith(q) ? 1 : 0;

      const score = Math.max(scoreName, prefixScore);
      if (score > bestScore) {
        bestScore = score;
        best = app;
      }
    }
    return { app: best, score: bestScore };
  }
}