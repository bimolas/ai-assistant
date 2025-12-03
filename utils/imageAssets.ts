// Image asset paths - Update these when you add images to assets/images/

// Character Images
export const characterImages: { [key: string]: any } = {};
try {
  characterImages['2b'] = require('../assets/images/2b-character.png');
} catch {
  // Image not found, will use fallback
}

// Background Images
export const backgroundImages: { [key: string]: any } = {};
// Add backgrounds when available:
// backgroundImages['default'] = require('../assets/images/background-default.png');

// Logo Images
export const logoImages: { [key: string]: any } = {};
try {
  logoImages['yorha'] = require('../assets/images/yorha-logo.png');
} catch {
  // Image not found, will use fallback
}

// Helper function to safely get image
export const getImage = (
  category: 'character' | 'background' | 'logo',
  key: string
): { uri: string } | number | undefined => {
  try {
    switch (category) {
      case 'character':
        return characterImages[key];
      case 'background':
        return backgroundImages[key];
      case 'logo':
        return logoImages[key];
      default:
        return undefined;
    }
  } catch {
    return undefined;
  }
};

// For remote images (if you want to use URLs instead of local files)
// For local files, use file:// protocol
export const remoteImages = {
  // Local file paths (use file:// protocol)
  '2b': 'file:///D:/Projects/2B/assets/images/2b-character.png',
  yorhaLogo: 'file:///D:/Projects/2B/assets/images/yorha-logo.png'
  // Or use remote URLs:
  // '2b': 'https://your-image-url.com/2b.png',
};

// Helper to get remote image
export const getRemoteImage = (key: string): { uri: string } | undefined => {
  const url = remoteImages[key as keyof typeof remoteImages];
  return url ? { uri: url } : undefined;
};

