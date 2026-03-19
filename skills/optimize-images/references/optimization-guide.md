# Image Optimization Deep Dive

Comprehensive guide to image optimization algorithms, format selection, and advanced techniques.

## Format Comparison

### PNG (Portable Network Graphics)

**Best for:**
- Screenshots with text
- Images with sharp edges (logos, icons)
- Images requiring transparency
- Graphics with limited colors

**Compression types:**
- Lossless (default)
- Lossy with palette reduction

**Sharp settings for PNG:**

```typescript
// Maximum compression, lossy
.png({
  quality: 80,
  compressionLevel: 9,
  adaptiveFiltering: true,
  palette: true,  // Reduces colors to 256 palette
})

// Lossless, high compression
.png({
  compressionLevel: 9,
  adaptiveFiltering: true,
  palette: false,
})
```

### JPEG (Joint Photographic Experts Group)

**Best for:**
- Photographs
- Complex images with gradients
- Images without transparency
- Hero images and backgrounds

**Compression:**
- Always lossy
- Quality 75-85 is typically invisible

**Sharp settings for JPEG:**

```typescript
// Optimal web compression
.jpeg({
  quality: 80,
  mozjpeg: true,  // Better encoder
})

// High quality for hero images
.jpeg({
  quality: 85,
  mozjpeg: true,
})
```

### WebP

**Best for:**
- Modern browsers (95%+ support)
- Significant size reduction over PNG/JPEG
- Both photos and graphics

**Comparison:**
- 25-35% smaller than JPEG at same quality
- 26% smaller than PNG

**Sharp settings for WebP:**

```typescript
// Lossy WebP
.webp({
  quality: 80,
  effort: 6,  // 0-6, higher = slower but smaller
})

// Lossless WebP (for graphics)
.webp({
  lossless: true,
})
```

### AVIF

**Best for:**
- Cutting-edge browsers (90%+ support)
- Maximum compression
- HDR images

**Comparison:**
- 50% smaller than JPEG
- Slower encoding

**Sharp settings for AVIF:**

```typescript
.avif({
  quality: 65,  // Lower value needed for same visual quality
  effort: 6,
})
```

## Optimization Algorithms

### PNG Compression Pipeline

1. **Filtering** - Predict pixel values to improve compression
   - None, Sub, Up, Average, Paeth filters
   - `adaptiveFiltering: true` chooses optimal filter per row

2. **Palette reduction** - Convert to 256-color indexed color
   - Dramatic size reduction for graphics
   - May cause banding in gradients

3. **DEFLATE compression** - Lossless compression
   - Level 0-9 (9 = maximum)
   - Higher levels slower but smaller

### JPEG Compression

1. **Color space conversion** - RGB to YCbCr
   - Separates luminance from chrominance

2. **Chroma subsampling** - Reduce color resolution
   - 4:2:0 (default): 4x compression on color
   - 4:4:4: No subsampling, larger files

3. **DCT transform** - Convert to frequency domain

4. **Quantization** - Remove high-frequency detail
   - Controlled by quality setting

5. **Entropy coding** - Huffman or arithmetic encoding
   - mozjpeg uses improved entropy coding

### MozJPEG Advantages

MozJPEG provides 5-10% better compression than libjpeg through:
- Optimized Huffman tables
- Trellis quantization
- Progressive scan optimization

Enable with `mozjpeg: true` in sharp.

## Quality Guidelines by Use Case

### Screenshots

```typescript
// Screenshots with text need higher quality
.png({ quality: 85, compressionLevel: 9, palette: true })
```

Expected savings: 40-60%

### Photographs

```typescript
// Photos can use lower quality
.jpeg({ quality: 75, mozjpeg: true })
```

Expected savings: 30-50%

### Hero/Banner Images

```typescript
// Heroes need to look good at large sizes
.jpeg({ quality: 85, mozjpeg: true })
// or
.png({ quality: 90, compressionLevel: 9 })
```

Expected savings: 20-40%

### Icons and Logos

```typescript
// Preserve crisp edges
.png({ quality: 90, compressionLevel: 9, palette: false })
```

Expected savings: 10-30%

### Watercolor/Artistic Images

```typescript
// Balance detail and size
.png({ quality: 80, compressionLevel: 9, palette: true })
```

Expected savings: 30-50%

## Advanced Techniques

### Progressive Loading (JPEG)

Progressive JPEGs load in multiple passes:

```typescript
.jpeg({
  quality: 80,
  mozjpeg: true,
  progressive: true,  // Enable progressive loading
})
```

Benefits:
- Perceived faster loading
- Slightly larger file size
- Better for slow connections

### Interlacing (PNG)

Adam7 interlacing for progressive PNG loading:

```typescript
.png({
  compressionLevel: 9,
  interlace: true,  // Enable interlacing
})
```

Note: Increases file size 10-20%, use only when progressive loading matters.

### Resize Before Compress

Don't compress images larger than needed:

```typescript
await sharp(input)
  .resize(1920, 1080, { fit: 'inside' })  // Max dimensions
  .jpeg({ quality: 80, mozjpeg: true })
  .toBuffer();
```

### Stripping Metadata

Remove EXIF data to reduce size:

```typescript
await sharp(input)
  .withMetadata({ exif: {} })  // Strip EXIF
  .jpeg({ quality: 80 })
  .toBuffer();
```

## Batch Processing Patterns

### Parallel Processing

```typescript
const files = await getAllImageFiles('./public/images');

// Process in parallel with concurrency limit
const CONCURRENCY = 4;
for (let i = 0; i < files.length; i += CONCURRENCY) {
  const batch = files.slice(i, i + CONCURRENCY);
  await Promise.all(batch.map(optimizeImage));
}
```

### Format Conversion

Convert all images to WebP while keeping originals:

```typescript
for (const file of files) {
  const webpPath = file.replace(/\.(png|jpe?g)$/i, '.webp');
  await sharp(file)
    .webp({ quality: 80 })
    .toFile(webpPath);
}
```

### Multi-Format Output

Generate multiple formats for `<picture>` element:

```typescript
const formats = ['avif', 'webp', 'jpeg'];
for (const format of formats) {
  await sharp(input)
    [format]({ quality: 80 })
    .toFile(`output.${format}`);
}
```

## Performance Benchmarks

Typical optimization results on a 79MB image directory:

| Format | Before | After | Savings |
|--------|--------|-------|---------|
| PNG | 74MB | 35MB | 53% |
| JPEG | 4.6MB | 3.2MB | 30% |
| **Total** | **79MB** | **38MB** | **52%** |

Processing speed with sharp (M1 Mac):
- ~50-100 images/second for small images
- ~10-20 images/second for large images

## Tool Comparison

| Tool | Speed | Quality | Ease |
|------|-------|---------|------|
| **sharp** | Fast | Excellent | Easy |
| imagemin | Medium | Good | Easy |
| squoosh-cli | Slow | Best | Medium |
| oxipng | Medium | Good (PNG) | Easy |
| pngquant | Fast | Good (PNG) | Easy |

**Recommendation:** Use sharp for most use cases. It's the fastest option with excellent quality and simple API.

## Next.js Integration

Next.js `next/image` automatically optimizes images at request time. However, pre-optimizing source images still provides benefits:

1. **Build performance** - Smaller source = faster builds
2. **Storage costs** - Smaller repo and deployment
3. **Direct imports** - Images imported outside `next/image` benefit
4. **CDN caching** - Less data to cache globally

Use both:
- Pre-optimize source images with sharp
- Use `next/image` for runtime optimization and responsive images
