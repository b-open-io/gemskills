# Gemini Skills for Claude Code

Claude Code plugin providing Gemini 3.0 Pro Preview skills for design analysis, spatial awareness, and visual critique.

## Features

- **ask-gemini**: Text + multi-image prompts (up to 10 images)
- Gemini 3.0 Pro Preview model (optimized for design/spatial awareness)
- Multi-image comparison support
- Clean API key handling (GEMINI_API_KEY only)

## Installation

### From GitHub

```bash
/plugin marketplace add https://github.com/b-open-io/gemskills
/plugin install gemskills
```

### Requirements

Set your Gemini API key as an environment variable:

```bash
export GEMINI_API_KEY="your-api-key-here"
```

Get an API key from: https://aistudio.google.com/apikey

## Skills

### ask-gemini

Ask Gemini 3.0 Pro Preview for design advice with optional images.

**Use cases:**
- Design review and critique
- Spatial layout analysis
- Visual hierarchy assessment
- Color scheme evaluation
- Typography feedback
- Comparing design alternatives (send multiple images)
- Three.js/WebGL composition analysis

**Examples:**

```bash
# Text-only
bun run ask_gemini.ts "What makes a good web3 landing page?"

# Single image
bun run ask_gemini.ts screenshot.png "Analyze this design"

# Compare multiple images
bun run ask_gemini.ts current.png target.png "Compare these - what are the key differences?"
```

## Why This Plugin?

- **Focused on design**: Gemini 3.0 Pro Preview excels at spatial awareness and visual analysis
- **Multi-image support**: Compare up to 10 images in a single request
- **Clean implementation**: No ambiguous API keys, minimal dependencies
- **Portable**: Works across projects, easy to install

## License

MIT
