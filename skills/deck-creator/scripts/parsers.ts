/**
 * Shared parsers for deck files (DECK-INDEX.md, DECK-PLAN.md, THEME.md, ANNOTATIONS.json)
 *
 * Used by both playground_server.ts and build_presenter.ts.
 */

export interface SlideAnnotation {
  id: string                              // "ann-<timestamp>-<rand>"
  x: number                               // % from left (0-100)
  y: number                               // % from top (0-100)
  note: string                            // edit instruction
  status: "open" | "applied" | "dismissed"
  created: number                         // timestamp ms
  element?: {
    type: string                          // "headline" | "subhead" | "content-point" | "background"
    pointIndex?: number                   // which bullet (0-based)
    currentText?: string                  // element text snapshot
  }
}

export interface AnnotationsFile {
  notes: Record<number, string>                     // speaker notes (backward compat)
  annotations: Record<string, SlideAnnotation[]>    // spatial/element annotations keyed by scope
}

export function parseAnnotationsFile(json: string): AnnotationsFile {
  const data = JSON.parse(json) as Partial<AnnotationsFile>
  if (!data || typeof data !== "object") {
    throw new Error("Annotations file must be a JSON object")
  }
  const notes = data.notes ?? {}
  const annotations = data.annotations ?? {}
  if (typeof notes !== "object" || Array.isArray(notes)) {
    throw new Error("Annotations file 'notes' must be an object map")
  }
  if (typeof annotations !== "object" || Array.isArray(annotations)) {
    throw new Error("Annotations file 'annotations' must be an object map")
  }
  return {
    notes: notes as Record<number, string>,
    annotations: annotations as Record<string, SlideAnnotation[]>,
  }
}

export function serializeAnnotationsFile(data: AnnotationsFile): string {
  return JSON.stringify(data, null, 2)
}

export function migrateMarkdownAnnotations(md: string): AnnotationsFile {
  const notes = parseAnnotations(md)
  return { notes, annotations: {} }
}

export interface SlideData {
  index: number
  title: string
  headline: string
  content: string
  visualConcept: string
  backgroundMode: "transparent" | "opaque" | "solid" | "gradient"
  type: string
  filename: string
  renderMode: "image" | "html"
}

export function parseDeckIndex(content: string): { slides: SlideData[]; title?: string; audience?: string; slideCount?: number } {
  const slides: SlideData[] = []
  const titleMatch = content.match(/^#\s+(.+)/m)
  const audienceMatch = content.match(/\*\*Audience:\*\*\s*(.+)/i)
  const slidesCountMatch = content.match(/\*\*Slides:\*\*\s*(\d+)/i)

  // Parse markdown table: | # | File | Title | Type |
  const tableLines = content.split("\n").filter(line => {
    const trimmed = line.trim()
    return trimmed.startsWith("|") && !trimmed.startsWith("| #") && !trimmed.startsWith("|--") && !trimmed.startsWith("| -")
  })

  for (const line of tableLines) {
    const cells = line.split("|").map(c => c.trim()).filter(Boolean)
    if (cells.length < 4) continue
    const num = parseInt(cells[0])
    if (isNaN(num)) continue

    // Extract filename from backtick-wrapped path like `slides/01-title.png`
    const fileCell = cells[1].replace(/`/g, "").trim()
    // Get just the filename part (strip slides/ or pages/ prefix)
    const filename = fileCell.replace(/^(slides|pages)\//, "")

    slides.push({
      index: num,
      title: cells[2],
      headline: "",
      content: "",
      visualConcept: "",
      backgroundMode: "opaque",
      type: cells[3] || "Content",
      filename,
      renderMode: /\.html$/i.test(filename) ? "html" : "image",
    })
  }

  return {
    slides,
    title: titleMatch?.[1]?.replace(/ - .+$/, "").replace(/^"|"$/g, "").trim(),
    audience: audienceMatch?.[1],
    slideCount: slidesCountMatch ? parseInt(slidesCountMatch[1]) : undefined,
  }
}

export function parseDeckPlan(content: string): {
  title?: string; audience?: string; goal?: string; context?: string; keyMessage?: string
  tone?: string; slideCount?: number
  slides: Array<Partial<SlideData> & { slideNum: number }>
} {
  const stripBold = (s: string | undefined) => s?.replace(/\*\*/g, "").trim()
  const titleMatch = content.match(/^#\s+(.+)/m)
  const audienceMatch = content.match(/(?:\*\*)?Audience(?:\*\*)?:\s*(.+)/i)
  const goalMatch = content.match(/(?:\*\*)?(?:Goal|Purpose)(?:\*\*)?:\s*(.+)/i)
  const contextMatch = content.match(/(?:\*\*)?Context(?:\*\*)?:\s*(.+)/i)
  const keyMsgMatch = content.match(/(?:\*\*)?Key Message(?:\*\*)?:\s*(.+)/i)
  const toneMatch = content.match(/(?:\*\*)?Tone(?:\*\*)?:\s*(.+)/i)
  const slidesCountMatch = content.match(/(?:\*\*)?(?:Slides|Pages)(?:\*\*)?:\s*(\d+)/i)

  const slides: Array<Partial<SlideData> & { slideNum: number }> = []

  // Parse slide sections: ### Slide N: Title or ### Page N: Title
  const slideRegex = /###\s+(?:Slide|Page)\s+(\d+):\s*(.+)/gi
  let match: RegExpExecArray | null
  const slidePositions: Array<{ num: number; title: string; start: number }> = []

  while ((match = slideRegex.exec(content)) !== null) {
    slidePositions.push({ num: parseInt(match[1]), title: match[2].trim(), start: match.index })
  }

  for (let i = 0; i < slidePositions.length; i++) {
    const pos = slidePositions[i]
    const endIdx = i + 1 < slidePositions.length ? slidePositions[i + 1].start : content.length
    const section = content.slice(pos.start, endIdx)

    const typeMatch = section.match(/(?:\*\*)?Type(?:\*\*)?:\s*(.+)/i)
    const headlineMatch = section.match(/(?:\*\*)?Headline(?:\*\*)?:\s*"?([^"\n]+)"?/i)
    const visualMatch = section.match(/(?:\*\*)?Visual(?:\*\*)?:\s*(.+)/i)
    const renderMatch = section.match(/(?:\*\*)?Render(?:\*\*)?:\s*(.+)/i)
    const backgroundModeMatch = section.match(
      /(?:\*\*)?Background Mode(?:\*\*)?:\s*(transparent|opaque|solid|gradient)/i,
    )
    // Strip markdown bold from captured values
    const cleanBold = (s: string | undefined) => s?.replace(/\*\*/g, "").trim()

    // Parse content points or content line
    let contentText = ""
    const contentPointsMatch = section.match(/(?:\*\*)?Content Points(?:\*\*)?:\s*\n((?:\s*[-*\d].+\n?)+)/i)
    const contentLineMatch = section.match(/(?:\*\*)?Content(?:\*\*)?:\s*(.+)/i)
    if (contentPointsMatch) {
      contentText = contentPointsMatch[1]
        .split("\n")
        .map(l => l.replace(/^\s*[-*\d.]+\s*/, "").trim())
        .filter(l => l && !/^\*?\*?Visual\*?\*?:/i.test(l) && !/^\*?\*?Key Message\*?\*?:/i.test(l))
        .join("\n")
    } else if (contentLineMatch) {
      // Strip empty bold marker placeholders (** ** ** ...) that appear as garbage content
      contentText = contentLineMatch[1]
        .replace(/(\*\*\s*)+/g, " ")
        .trim()
    }

    // For children's book format: **Text:** "..."
    const textMatch = section.match(/\*\*Text:\*\*\s*"?([^"]+)"?/i)
    if (textMatch && !headlineMatch) {
      // Use text as content for storybook format
    }

    const renderModeRaw = cleanBold(renderMatch?.[1])?.toLowerCase()
    const renderMode: "image" | "html" =
      renderModeRaw === "html" ? "html" : "image"
    const backgroundModeRaw = cleanBold(backgroundModeMatch?.[1])?.toLowerCase()
    const backgroundMode: "transparent" | "opaque" | "solid" | "gradient" =
      backgroundModeRaw === "transparent" ? "transparent"
      : backgroundModeRaw === "solid" ? "solid"
      : backgroundModeRaw === "gradient" ? "gradient"
      : "opaque"

    slides.push({
      slideNum: pos.num,
      title: pos.title,
      headline: cleanBold(headlineMatch?.[1]) || "",
      content: contentText || textMatch?.[1]?.trim() || "",
      visualConcept: cleanBold(visualMatch?.[1]) || "",
      backgroundMode,
      type: cleanBold(typeMatch?.[1]) || "",
      renderMode,
    })
  }

  return {
    title: titleMatch?.[1]?.replace(/ - .+$/, "").replace(/^"|"$/g, "").trim(),
    audience: stripBold(audienceMatch?.[1]),
    goal: stripBold(goalMatch?.[1]),
    context: stripBold(contextMatch?.[1]),
    keyMessage: stripBold(keyMsgMatch?.[1]),
    tone: stripBold(toneMatch?.[1]),
    slideCount: slidesCountMatch ? parseInt(slidesCountMatch[1]) : undefined,
    slides,
  }
}

/** Known TweakCN theme variable keys. */
const TWEAKCN_KEYS = new Set([
  "background", "foreground",
  "card", "card-foreground",
  "popover", "popover-foreground",
  "primary", "primary-foreground",
  "secondary", "secondary-foreground",
  "muted", "muted-foreground",
  "accent", "accent-foreground",
  "destructive", "destructive-foreground",
  "border", "input", "ring",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "sidebar", "sidebar-foreground",
  "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground",
  "sidebar-border", "sidebar-ring",
  "font-sans", "font-serif", "font-mono",
  "radius", "letter-spacing", "spacing",
  "shadow-color", "shadow-opacity", "shadow-blur",
  "shadow-spread", "shadow-offset-x", "shadow-offset-y",
])

export function parseTheme(content: string): {
  themeConfig: Record<string, string>
  themeModes?: {
    light: Record<string, string>
    dark: Record<string, string>
  }
  styleId?: string | null
  styleRecipeId?: string | null
  stylePrompt?: string
  backgroundMedia?: string
  videoBackground?: string
  videoLoop?: boolean
  fontFamily?: string
  slideThemeMode?: "light" | "dark"
  aspectRatio?: string
  bgColor?: string
  accentColor?: string
} {
  const parseThemeVars = (source: string): Record<string, string> => {
    const out: Record<string, string> = {}
    const kvRegex = /^-\s+([\w-]+):\s*(.+)/gm
    let kvMatch: RegExpExecArray | null
    while ((kvMatch = kvRegex.exec(source)) !== null) {
      const key = kvMatch[1].toLowerCase()
      let val = kvMatch[2].trim()
      // Theme authors often annotate hex colors for readability, for example:
      // "#0a0f1a (deep navy-charcoal)". Keep the CSS value and discard only a
      // complete trailing parenthetical annotation.
      const describedHex = val.match(
        /^(#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8}))\s+\([^)]*\)$/i,
      )
      if (describedHex) val = describedHex[1]
      if (TWEAKCN_KEYS.has(key)) out[key] = val
    }
    return out
  }

  const extractSection = (heading: string): string => {
    const esc = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const headingRe = new RegExp(`^##\\s+${esc}\\s*$`, "im")
    const match = headingRe.exec(content)
    if (!match) return ""
    const start = match.index + match[0].length
    const rest = content.slice(start)
    const nextHeading = rest.search(/\n##\s+/i)
    if (nextHeading === -1) return rest
    return rest.slice(0, nextHeading)
  }

  const lightSection = extractSection("Theme Variables (Light)")
  const darkSection = extractSection("Theme Variables (Dark)")
  const lightTheme = parseThemeVars(lightSection)
  const darkTheme = parseThemeVars(darkSection)
  const hasModeSections =
    Object.keys(lightTheme).length > 0 || Object.keys(darkTheme).length > 0

  const themeConfig: Record<string, string> = hasModeSections
    ? {}
    : parseThemeVars(content)

  // Legacy format backward compat (old THEME.md used "Background: #xxx")
  if (!themeConfig.background) {
    const bgMatch = content.match(/Background:\s*`?(#[0-9a-fA-F]{3,8})`?/)
    if (bgMatch) themeConfig.background = bgMatch[1]
  }
  if (!themeConfig.primary) {
    const primaryMatch = content.match(/Primary:\s*`?(#[0-9a-fA-F]{3,8})`?/)
    if (primaryMatch) themeConfig.primary = primaryMatch[1]
  }
  if (!themeConfig.radius) {
    const radiusMatch = content.match(/Radius:\s*(\d+)px/i)
    if (radiusMatch) themeConfig.radius = `${radiusMatch[1]}px`
  }
  if (!themeConfig["letter-spacing"]) {
    const lsMatch = content.match(/Letter Spacing:\s*(\S+)/i)
    if (lsMatch) themeConfig["letter-spacing"] = lsMatch[1].trim()
  }

  // Art Style
  const artStyleMatch = content.match(/Art Style:\s*(\S+)/)
  const styleRecipeMatch = content.match(/Style Recipe:\s*([^\n]+)/i)
  const styleParenMatch = content.match(/\*?\*?Style\*?\*?:\s*.*\(`?(\w[\w-]*)`?\)/)
  const rawStyleId = artStyleMatch?.[1] || styleParenMatch?.[1]
  const rawStyleRecipeId = styleRecipeMatch?.[1]?.trim()

  // Optional multiline style prompt block:
  // - Style Prompt: |
  //   line 1
  //   line 2
  let stylePrompt: string | undefined
  const stylePromptBlockMatch = content.match(
    /- Style Prompt:\s*\|\s*\n((?:[ \t].*(?:\n|$))*)/i,
  )
  if (stylePromptBlockMatch?.[1]) {
    const unindented = stylePromptBlockMatch[1]
      .split("\n")
      .map((line) => line.replace(/^[ \t]{2}/, ""))
      .join("\n")
      .trim()
    if (unindented) stylePrompt = unindented
  } else {
    const inlinePrompt = content.match(/Style Prompt:\s*(.+)/i)?.[1]?.trim()
    if (inlinePrompt && inlinePrompt !== "|") stylePrompt = inlinePrompt
  }

  // Background Media (new) + Video Background (legacy)
  const backgroundMediaMatch = content.match(/Background Media:\s*(.+)/i)
  const videoLoopMatch = content.match(/Video Loop:\s*(true|false)/i)
  const videoMatch = content.match(/Video Background:\s*(.+)/i)
  const slideModeMatch = content.match(/Slide Mode:\s*(light|dark)/i)
  const aspectRatioMatch = content.match(/Aspect Ratio:\s*([0-9]+\s*:\s*[0-9]+)/i)

  // Font: legacy "Font:" line, or font-sans from themeConfig
  let fontFamily: string | undefined
  const fontMatch = content.match(/Font:\s*(.+)/i)
  if (fontMatch) {
    const f = fontMatch[1].trim()
    if (f && f !== "system") fontFamily = f
  }
  if (themeConfig["font-sans"]) {
    fontFamily = themeConfig["font-sans"]
  }

  function inferModeFromBackground(bg?: string): "light" | "dark" | undefined {
    if (!bg) return undefined
    const hex = bg.trim().toLowerCase()
    const match = hex.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
    if (!match) return undefined
    const raw = match[1]
    const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw
    const r = parseInt(full.slice(0, 2), 16)
    const g = parseInt(full.slice(2, 4), 16)
    const b = parseInt(full.slice(4, 6), 16)
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    return luminance >= 140 ? "light" : "dark"
  }

  const parsedSlideMode = slideModeMatch?.[1]?.toLowerCase() as
    | "light"
    | "dark"
    | undefined
  // Only infer mode from background when there's a single legacy themeConfig.
  // When both light/dark mode sections exist, inferring from one section's
  // background is circular and always biases toward whichever is checked first.
  const inferredSlideMode = hasModeSections
    ? undefined
    : inferModeFromBackground(themeConfig.background)
  const resolvedSlideMode = parsedSlideMode || inferredSlideMode
  const selectedModeConfig =
    resolvedSlideMode === "light"
      ? lightTheme
      : resolvedSlideMode === "dark"
        ? darkTheme
        : {}
  const selectedThemeConfig =
    hasModeSections && Object.keys(selectedModeConfig).length > 0
      ? selectedModeConfig
      : themeConfig

  return {
    themeConfig: selectedThemeConfig,
    themeModes: hasModeSections
      ? {
          light: lightTheme,
          dark: darkTheme,
        }
      : undefined,
    styleId:
      rawStyleId !== undefined
        ? rawStyleId && rawStyleId !== "none"
          ? rawStyleId
          : null
        : undefined,
    styleRecipeId:
      rawStyleRecipeId !== undefined
        ? rawStyleRecipeId && rawStyleRecipeId !== "none"
          ? rawStyleRecipeId
          : null
        : undefined,
    stylePrompt,
    backgroundMedia:
      backgroundMediaMatch?.[1]?.trim() || videoMatch?.[1]?.trim(),
    videoBackground: videoMatch?.[1]?.trim(),
    videoLoop: videoLoopMatch ? videoLoopMatch[1].toLowerCase() === "true" : undefined,
    fontFamily,
    slideThemeMode: resolvedSlideMode,
    aspectRatio: aspectRatioMatch?.[1]?.replace(/\s+/g, ""),
    bgColor: selectedThemeConfig.background,
    accentColor: selectedThemeConfig.primary,
  }
}

export function parseAnnotations(content: string): Record<number, string> {
  const annotations: Record<number, string> = {}

  // Parse sections: ## Slide N
  const sectionRegex = /##\s+Slide\s+(\d+)/gi
  let match: RegExpExecArray | null
  const positions: Array<{ num: number; start: number }> = []

  while ((match = sectionRegex.exec(content)) !== null) {
    positions.push({ num: parseInt(match[1]), start: match.index + match[0].length })
  }

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]
    const endIdx = i + 1 < positions.length ? positions[i + 1].start - (`## Slide ${positions[i + 1].num}`).length : content.length
    const text = content.slice(pos.start, endIdx).trim()
    if (text) {
      annotations[pos.num] = text
    }
  }

  return annotations
}

export function serializeAnnotations(annotations: Record<number, string>): string {
  const lines = ["# Speaker Notes", ""]
  const indices = Object.keys(annotations).map(Number).sort((a, b) => a - b)

  for (const idx of indices) {
    const text = annotations[idx]?.trim()
    if (text) {
      lines.push(`## Slide ${idx}`)
      lines.push(text)
      lines.push("")
    }
  }

  return lines.join("\n")
}
