# Gemini Skills for Claude Code

Claude Code plugin for Gemini 3.0 Pro Preview - design analysis, spatial awareness, and visual critique.

## What This Does

Provides a skill for asking Gemini 3.0 Pro Preview questions with optional images. Gemini excels at spatial reasoning and visual analysis, making it ideal for design work.

## Installation

```bash
/plugin marketplace add https://github.com/b-open-io/gemskills
/plugin install gemskills
```

**Requirements**: Set `GEMINI_API_KEY` environment variable ([get one here](https://aistudio.google.com/apikey))

## Usage

### ask-gemini skill

Ask Gemini for design feedback with up to 10 images.

**Examples:**

```bash
# Text only
"What makes effective web3 landing page design?"

# Single image analysis
"Analyze this Three.js composition" (with screenshot attached)

# Compare multiple designs
"Compare these two landing pages - what works better?" (with 2 screenshots)
```

**Best for:**
- Design critique and spatial layout analysis
- Visual hierarchy and typography feedback
- Comparing design alternatives
- Three.js/WebGL composition analysis
- Color scheme evaluation

## Why Use This

Gemini 3.0 Pro Preview is specifically strong at spatial awareness and visual understanding - better than other models for design feedback. The multi-image support lets you compare alternatives in a single request.

## License

MIT
