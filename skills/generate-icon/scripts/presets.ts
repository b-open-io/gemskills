/**
 * Icon presets for all major platforms
 * Each preset defines master size, required sizes, and format requirements
 */

export interface IconSize {
  size: number;
  suffix?: string; // e.g., "@2x" for retina
  filename?: string; // Override default filename pattern
}

export interface IconPreset {
  name: string;
  description: string;
  masterSize: number;
  requiresTransparency: boolean;
  format: "png" | "ico" | "icns";
  sizes: IconSize[];
  generateBundle?: boolean; // ICO/ICNS bundle
}

export const PRESETS: Record<string, IconPreset> = {
  "apple-app-icon": {
    name: "Apple App Icon",
    description: "iOS/iPadOS App Store icons (no transparency, no rounded corners)",
    masterSize: 1024,
    requiresTransparency: false,
    format: "png",
    sizes: [
      // App Store
      { size: 1024, filename: "AppIcon-1024.png" },
      // iPhone
      { size: 180, filename: "AppIcon-60@3x.png" },
      { size: 120, filename: "AppIcon-60@2x.png" },
      { size: 120, filename: "AppIcon-40@3x.png" },
      { size: 87, filename: "AppIcon-29@3x.png" },
      { size: 80, filename: "AppIcon-40@2x.png" },
      { size: 60, filename: "AppIcon-20@3x.png" },
      { size: 58, filename: "AppIcon-29@2x.png" },
      { size: 40, filename: "AppIcon-20@2x.png" },
      // iPad
      { size: 167, filename: "AppIcon-83.5@2x.png" },
      { size: 152, filename: "AppIcon-76@2x.png" },
      { size: 76, filename: "AppIcon-76.png" },
      // iPad Pro
      { size: 80, filename: "AppIcon-40@2x~ipad.png" },
      { size: 40, filename: "AppIcon-40.png" },
      // Settings/Spotlight
      { size: 58, filename: "AppIcon-29@2x~ipad.png" },
      { size: 29, filename: "AppIcon-29.png" },
      { size: 40, filename: "AppIcon-20@2x~ipad.png" },
      { size: 20, filename: "AppIcon-20.png" },
    ],
  },

  "android-app-icon": {
    name: "Android App Icon",
    description: "Google Play and adaptive icon foreground layers",
    masterSize: 1024,
    requiresTransparency: true,
    format: "png",
    sizes: [
      // Google Play Store
      { size: 512, filename: "playstore-icon.png" },
      // Launcher icons (mipmap)
      { size: 192, filename: "mipmap-xxxhdpi/ic_launcher.png" },
      { size: 144, filename: "mipmap-xxhdpi/ic_launcher.png" },
      { size: 96, filename: "mipmap-xhdpi/ic_launcher.png" },
      { size: 72, filename: "mipmap-hdpi/ic_launcher.png" },
      { size: 48, filename: "mipmap-mdpi/ic_launcher.png" },
      // Adaptive icon foreground (108dp with 72dp safe zone = 66%)
      { size: 432, filename: "mipmap-xxxhdpi/ic_launcher_foreground.png" },
      { size: 324, filename: "mipmap-xxhdpi/ic_launcher_foreground.png" },
      { size: 216, filename: "mipmap-xhdpi/ic_launcher_foreground.png" },
      { size: 162, filename: "mipmap-hdpi/ic_launcher_foreground.png" },
      { size: 108, filename: "mipmap-mdpi/ic_launcher_foreground.png" },
    ],
  },

  favicon: {
    name: "Favicon",
    description: "Browser tab icons with ICO bundle and PNG fallbacks",
    masterSize: 512,
    requiresTransparency: true,
    format: "ico",
    generateBundle: true,
    sizes: [
      { size: 256, filename: "favicon-256x256.png" },
      { size: 128, filename: "favicon-128x128.png" },
      { size: 64, filename: "favicon-64x64.png" },
      { size: 48, filename: "favicon-48x48.png" },
      { size: 32, filename: "favicon-32x32.png" },
      { size: 16, filename: "favicon-16x16.png" },
      // Apple touch icon
      { size: 180, filename: "apple-touch-icon.png" },
      // Safari pinned tab (needs special handling - SVG preferred)
      { size: 512, filename: "safari-pinned-tab.png" },
    ],
  },

  pwa: {
    name: "PWA Icons",
    description: "Progressive Web App manifest icons including maskable",
    masterSize: 512,
    requiresTransparency: true,
    format: "png",
    sizes: [
      { size: 512, filename: "icon-512x512.png" },
      { size: 384, filename: "icon-384x384.png" },
      { size: 256, filename: "icon-256x256.png" },
      { size: 192, filename: "icon-192x192.png" },
      { size: 144, filename: "icon-144x144.png" },
      { size: 128, filename: "icon-128x128.png" },
      { size: 96, filename: "icon-96x96.png" },
      { size: 72, filename: "icon-72x72.png" },
      { size: 48, filename: "icon-48x48.png" },
      // Maskable icons (same sizes, different directory)
      { size: 512, filename: "maskable-512x512.png" },
      { size: 192, filename: "maskable-192x192.png" },
    ],
  },

  "macos-icns": {
    name: "macOS ICNS",
    description: "macOS desktop app icon bundle",
    masterSize: 1024,
    requiresTransparency: true,
    format: "icns",
    generateBundle: true,
    sizes: [
      // Standard + @2x pairs for iconset
      { size: 1024, filename: "icon_512x512@2x.png" },
      { size: 512, filename: "icon_512x512.png" },
      { size: 512, filename: "icon_256x256@2x.png" },
      { size: 256, filename: "icon_256x256.png" },
      { size: 256, filename: "icon_128x128@2x.png" },
      { size: 128, filename: "icon_128x128.png" },
      { size: 64, filename: "icon_32x32@2x.png" },
      { size: 32, filename: "icon_32x32.png" },
      { size: 32, filename: "icon_16x16@2x.png" },
      { size: 16, filename: "icon_16x16.png" },
    ],
  },

  "windows-ico": {
    name: "Windows ICO",
    description: "Windows desktop app icon bundle",
    masterSize: 512,
    requiresTransparency: true,
    format: "ico",
    generateBundle: true,
    sizes: [
      { size: 256, filename: "icon-256.png" },
      { size: 128, filename: "icon-128.png" },
      { size: 64, filename: "icon-64.png" },
      { size: 48, filename: "icon-48.png" },
      { size: 32, filename: "icon-32.png" },
      { size: 24, filename: "icon-24.png" },
      { size: 16, filename: "icon-16.png" },
    ],
  },

  "ui-icons": {
    name: "UI Icons",
    description: "In-app icons for various UI contexts",
    masterSize: 512,
    requiresTransparency: true,
    format: "png",
    sizes: [
      { size: 512, filename: "icon-512.png" },
      { size: 256, filename: "icon-256.png" },
      { size: 128, filename: "icon-128.png" },
      { size: 64, filename: "icon-64.png" },
      { size: 48, filename: "icon-48.png" },
      { size: 32, filename: "icon-32.png" },
      { size: 24, filename: "icon-24.png" },
      { size: 20, filename: "icon-20.png" },
      { size: 16, filename: "icon-16.png" },
    ],
  },
};

export function getPreset(name: string): IconPreset | undefined {
  return PRESETS[name];
}

export function listPresets(): string[] {
  return Object.keys(PRESETS);
}

export function getPresetInfo(name: string): string {
  const preset = PRESETS[name];
  if (!preset) return `Unknown preset: ${name}`;
  return `${preset.name}: ${preset.description} (${preset.sizes.length} sizes, master ${preset.masterSize}px)`;
}
