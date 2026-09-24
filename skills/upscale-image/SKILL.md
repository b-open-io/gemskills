---
name: upscale-image
description: This skill should be used when the user asks to "upscale an image", "increase image resolution", "make image bigger", "enlarge image", or "enhance image resolution". Supports Vertex AI and Atlas Cloud.
---

# Upscale Image

Upscale images using Imagen on Vertex AI by default, or Atlas Cloud as an optional provider.

## Prerequisites

Choose one provider:

- **Vertex AI (default):** Google Cloud project and Application Default Credentials.
- **Atlas Cloud:** `ATLASCLOUD_API_KEY`; no Google Cloud setup is required.

### Check Current Setup

```bash
echo "Project: ${GOOGLE_CLOUD_PROJECT:-NOT SET}"
gcloud auth application-default print-access-token &>/dev/null && echo "Auth: OK" || echo "Auth: NOT CONFIGURED"
```

### First-Time Setup

If credentials are not configured, guide the user through these steps:

1. **Get a Google Cloud Project**
   - Go to: https://console.cloud.google.com/projectcreate
   - Create a new project or use an existing one
   - Note the Project ID (not the project name)

2. **Enable Vertex AI API**
   - Go to: https://console.cloud.google.com/apis/library/aiplatform.googleapis.com
   - Click "Enable"

3. **Enable Billing**
   - Go to: https://console.developers.google.com/billing/enable?project=YOUR_PROJECT_ID
   - Link a billing account

4. **Install gcloud CLI** (if not installed)
   - Go to: https://cloud.google.com/sdk/docs/install
   - Or on macOS: `brew install google-cloud-sdk`

5. **Authenticate**
   ```bash
   gcloud auth application-default login
   ```
   This opens a browser for Google sign-in.

6. **Set Environment Variable**
   ```bash
   echo 'export GOOGLE_CLOUD_PROJECT=your-project-id' >> ~/.zshenv
   ```

### Atlas Cloud Setup

Set the API key in your environment:

```bash
export ATLASCLOUD_API_KEY="your-atlascloud-api-key"
```

## Usage

```bash
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/upscale-image/scripts/upscale.ts <input-image> [options]
```

### Options

- `--factor <x2|x4>` - Upscale factor (default: x2)
- `--format <png|jpeg|jpg|webp>` - Output format
- `--quality <n>` - JPEG quality (1-100)
- `--output <path>` - Output path
- `--provider <vertex|atlas>` - Upscale provider (default: `vertex`)
- `--project <id>` - Google Cloud project (overrides env var)
- `--location <region>` - Vertex AI location (default: us-central1)

### Examples

```bash
# 2x upscale
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/upscale-image/scripts/upscale.ts photo.jpg

# 4x upscale
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/upscale-image/scripts/upscale.ts photo.jpg --factor x4

# Upscale and save as PNG
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/upscale-image/scripts/upscale.ts photo.jpg --factor x4 --format png --output hires.png

# Specify project explicitly
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/upscale-image/scripts/upscale.ts photo.jpg --project my-gcp-project --factor x4

# Use Atlas Cloud without changing the default Vertex workflow
bun run --cwd ${CLAUDE_PLUGIN_ROOT} ${CLAUDE_PLUGIN_ROOT}/skills/upscale-image/scripts/upscale.ts photo.jpg --provider atlas --factor x4 --format png
```

## Context Discipline

**Do not read generated images back into context.** The script outputs only the file path. Ask the user to visually inspect the result. Upscaled images are especially large (2x/4x resolution) and will quickly exhaust the context window.

## Model

Vertex uses `imagen-3.0-generate-002` via the Vertex AI `upscaleImage` API.

Atlas Cloud uses `atlascloud/image-upscaler`, uploads the local input temporarily,
submits one upscale request, and polls the prediction endpoint until completion.

## Why Vertex AI?

The Imagen upscaling API is only available through Vertex AI, not the standard Gemini API. This is a Google limitation - the `upscaleImage` method in the @google/genai SDK only works with Vertex AI backend.
