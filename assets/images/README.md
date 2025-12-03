# YoRHa 2B Images

Place your YoRHa and 2B images in this folder.

## Recommended Images:

1. **2B Character Art** (`2b-character.png` or `.jpg`)
   - Portrait/artwork of 2B
   - Recommended size: 512x512px or larger
   - Transparent background preferred

2. **YoRHa Logo** (`yorha-logo.png`)
   - Official YoRHa logo
   - Recommended size: 256x256px

3. **Background Images** (`background-*.png` or `.jpg`)
   - Nier Automata themed backgrounds
   - Recommended size: 1080x1920px (portrait)

4. **Home Screen Image** (`home-2b.png`)
   - 2B image for home screen
   - Recommended size: 400x400px

## Usage:

After adding images, update the screen components to use them:

```typescript
import { CharacterImage } from '../components/CharacterImage';

// In your component:
<CharacterImage 
  source={require('../assets/images/2b-character.png')} 
  size={200} 
/>
```

## Image Sources:

You can find official Nier Automata artwork and YoRHa logos from:
- Official Square Enix/NieR website
- Nier Automata artbooks
- Official game assets (with proper licensing)

Make sure you have the rights to use any images you add to this project.

