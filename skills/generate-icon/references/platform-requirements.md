# Platform Icon Requirements

Detailed specifications for each platform's icon requirements.

## Apple App Store (iOS/iPadOS)

**Key Requirements:**
- NO transparency - must have solid background
- NO rounded corners - iOS applies mask automatically
- 1024x1024px for App Store
- sRGB color space

**Required Sizes:**
| Size | Usage |
|------|-------|
| 1024x1024 | App Store |
| 180x180 | iPhone @3x |
| 167x167 | iPad Pro @2x |
| 152x152 | iPad @2x |
| 120x120 | iPhone @2x, iPhone Spotlight @3x |
| 87x87 | iPhone Settings @3x |
| 80x80 | iPad Spotlight @2x |
| 76x76 | iPad |
| 60x60 | iPhone Notification @3x |
| 58x58 | iPhone/iPad Settings @2x |
| 40x40 | iPhone Spotlight @2x, iPad Notification @2x |
| 29x29 | iPhone/iPad Settings |
| 20x20 | iPhone/iPad Notification |

**Asset Catalog Structure:**
```
AppIcon.appiconset/
├── Contents.json
├── AppIcon-1024.png
├── AppIcon-60@3x.png
├── AppIcon-60@2x.png
└── ...
```

---

## Google Play Store (Android)

**Key Requirements:**
- 512x512px for Play Store listing
- Transparency allowed
- 32-bit PNG (ARGB)

**Adaptive Icons (Android 8.0+):**
- Foreground layer: 108dp (432px @xxxhdpi)
- Safe zone: 72dp centered (66% of total)
- Background layer: separate solid or gradient
- System applies various masks (circle, squircle, etc.)

**Required Sizes (mipmap folders):**
| Density | Size | Folder |
|---------|------|--------|
| xxxhdpi | 192x192 | mipmap-xxxhdpi |
| xxhdpi | 144x144 | mipmap-xxhdpi |
| xhdpi | 96x96 | mipmap-xhdpi |
| hdpi | 72x72 | mipmap-hdpi |
| mdpi | 48x48 | mipmap-mdpi |

**Adaptive Foreground Sizes:**
| Density | Size |
|---------|------|
| xxxhdpi | 432x432 |
| xxhdpi | 324x324 |
| xhdpi | 216x216 |
| hdpi | 162x162 |
| mdpi | 108x108 |

---

## Favicon (Web)

**Key Requirements:**
- favicon.ico for legacy browser support
- PNG fallbacks for modern browsers
- apple-touch-icon.png for iOS Safari

**Recommended Files:**
| File | Size | Usage |
|------|------|-------|
| favicon.ico | 16, 32, 48 | Legacy browsers, Windows |
| favicon-32x32.png | 32x32 | Standard browsers |
| favicon-16x16.png | 16x16 | Browser tabs |
| apple-touch-icon.png | 180x180 | iOS Safari |
| safari-pinned-tab.svg | Vector | Safari pinned tabs |
| favicon-256x256.png | 256x256 | High-DPI, thumbnails |

**HTML Integration:**
```html
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
```

---

## PWA (Progressive Web App)

**Key Requirements:**
- Multiple sizes for manifest.json
- Maskable icons for Android adaptive display
- Transparency allowed

**Manifest Sizes:**
| Size | Purpose |
|------|---------|
| 512x512 | Install prompt, splash screen |
| 384x384 | Splash screen |
| 256x256 | Various contexts |
| 192x192 | Home screen (Android) |
| 144x144 | Taskbar |
| 128x128 | Chrome Web Store |
| 96x96 | Older Android |
| 72x72 | Legacy |
| 48x48 | Legacy |

**Maskable Icons:**
- Safe zone: 80% of icon area (centered)
- Used for adaptive home screen icons
- Same sizes as standard icons

**manifest.json Example:**
```json
{
  "icons": [
    { "src": "/icon-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512x512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/maskable-192x192.png", "sizes": "192x192", "type": "image/png", "purpose": "maskable" },
    { "src": "/maskable-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

---

## macOS (.icns)

**Key Requirements:**
- ICNS format (Apple proprietary bundle)
- Created via `iconutil -c icns`
- Requires .iconset directory with specific filenames

**Required Sizes:**
| Filename | Size | Usage |
|----------|------|-------|
| icon_512x512@2x.png | 1024x1024 | Retina |
| icon_512x512.png | 512x512 | Standard |
| icon_256x256@2x.png | 512x512 | Retina |
| icon_256x256.png | 256x256 | Standard |
| icon_128x128@2x.png | 256x256 | Retina |
| icon_128x128.png | 128x128 | Standard |
| icon_32x32@2x.png | 64x64 | Retina |
| icon_32x32.png | 32x32 | Standard |
| icon_16x16@2x.png | 32x32 | Retina |
| icon_16x16.png | 16x16 | Standard |

**Creation Process:**
```bash
# Create iconset directory
mkdir MyApp.iconset

# Add all required PNGs with exact filenames
# Then convert to ICNS
iconutil -c icns MyApp.iconset -o MyApp.icns
```

---

## Windows (.ico)

**Key Requirements:**
- ICO format (multi-resolution container)
- Created via ImageMagick or similar
- Includes multiple sizes in one file

**Required Sizes:**
| Size | Usage |
|------|-------|
| 256x256 | High-DPI, Windows 10+ |
| 128x128 | Large icons view |
| 64x64 | Medium icons |
| 48x48 | Explorer, Start menu |
| 32x32 | Desktop, taskbar |
| 24x24 | Toolbar |
| 16x16 | Title bar, small icons |

**Creation with ImageMagick:**
```bash
convert icon-256.png icon-128.png icon-64.png icon-48.png icon-32.png icon-24.png icon-16.png app.ico
```

**Note:** PNG compression is supported in ICO files for sizes ≥256px.
