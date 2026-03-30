import { existsSync, mkdirSync, writeFileSync, copyFileSync } from "fs";
import { join } from "path";

const DEFAULT_SCENE_COUNT = 3;
const DEFAULT_IMAGEN_MODEL = "imagen-4.0-fast-generate-001";
const DEFAULT_ASPECT_RATIO = "9:16";
const DEFAULT_PROMPT_SUFFIX = ", no text no watermarks, 9:16 vertical";

export interface SceneConfig {
  tipText: string;
  tipTitle: string;
  category: string;
  sceneCount?: number;
  imagenModel?: string;
  aspectRatio?: string;
  promptSuffix?: string;
  outputDir: string;
  backgroundsDir?: string;
}

export interface SceneResult {
  imagePaths: string[];
  prompts: string[];
  source: "imagen" | "fallback";
}

/**
 * Resolve Google API key from environment or .env file.
 */
function getApiKey(): string {
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;

  // Try reading from area6-health-tips/.env as fallback
  try {
    const { readFileSync } = require("fs");
    const envPath = join(
      process.cwd(),
      "..",
      "area6-health-tips",
      ".env"
    );
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("GEMINI_API_KEY=")) {
          return trimmed.split("=", 2)[1].trim();
        }
        if (trimmed.startsWith("GOOGLE_API_KEY=")) {
          return trimmed.split("=", 2)[1].trim();
        }
      }
    }
  } catch {
    // ignore
  }

  throw new Error(
    "No API key found. Set GOOGLE_API_KEY or GEMINI_API_KEY env variable."
  );
}

/**
 * Use Gemini to generate scene image prompts from tip text.
 */
async function generateScenePrompts(
  tipTitle: string,
  tipText: string,
  category: string,
  sceneCount: number,
  apiKey: string
): Promise<string[]> {
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

  const body = {
    contents: [
      {
        parts: [
          {
            text: `Generate ${sceneCount} image prompts for a health tip video about: "${tipTitle}" — ${tipText}

Category: ${category}

Each prompt should describe a cinematic 9:16 vertical photo for these scenes:
1. HOOK scene — dramatic visual that grabs attention related to the topic
2. FACT scene — visual that illustrates the health science/fact
3. CTA scene — inspiring visual that motivates action

Rules:
- Professional cinematic photography style
- Dark moody lighting with orange accents
- No text, no watermarks, no logos in the image
- Each prompt should be 1-2 sentences max
- Fitness/health/wellness aesthetic

Output ONLY a JSON array of ${sceneCount} strings, no explanation:
["prompt1", "prompt2", "prompt3"]`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.8,
    },
  };

  const response = await fetch(`${url}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  let raw: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

  // Strip markdown code fences if present
  if (raw.startsWith("```")) {
    raw = raw.split("\n").slice(1).join("\n");
    raw = raw.replace(/```\s*$/, "").trim();
  }

  const prompts: string[] = JSON.parse(raw);
  if (!Array.isArray(prompts) || prompts.length === 0) {
    throw new Error("Gemini returned invalid prompt array");
  }

  return prompts.slice(0, sceneCount);
}

/**
 * Generate a single image via Imagen 4 API.
 * Returns base64-encoded PNG image data, or null on failure.
 */
async function generateImageWithImagen(
  prompt: string,
  model: string,
  aspectRatio: string,
  apiKey: string
): Promise<Buffer | null> {
  // Use the generateImages endpoint (predict-style)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`;

  const body = {
    instances: [{ prompt }],
    parameters: {
      sampleCount: 1,
      aspectRatio,
      outputOptions: { mimeType: "image/png" },
    },
  };

  try {
    const response = await fetch(`${url}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Imagen API error (${response.status}): ${errText}`);
      return null;
    }

    const data = await response.json();
    const b64 =
      data?.predictions?.[0]?.bytesBase64Encoded ??
      data?.predictions?.[0]?.image?.bytesBase64Encoded;

    if (!b64) {
      console.error("Imagen returned no image data");
      return null;
    }

    return Buffer.from(b64, "base64");
  } catch (err) {
    console.error(`Imagen request failed: ${err}`);
    return null;
  }
}

/**
 * Fallback: copy a category background image to the output path.
 * Tries {category}.png, then falls back to background.png.
 */
function copyFallbackBackground(
  category: string,
  backgroundsDir: string,
  outputPath: string
): boolean {
  const primary = join(backgroundsDir, `${category}.png`);
  const fallback = join(backgroundsDir, "background.png");

  const src = existsSync(primary)
    ? primary
    : existsSync(fallback)
      ? fallback
      : null;

  if (!src) return false;

  copyFileSync(src, outputPath);
  return true;
}

/**
 * Generate AI scene images for a health tip video.
 *
 * Flow:
 * 1. Use Gemini to generate scene prompts from tip text
 * 2. Use Imagen 4 to generate images from those prompts
 * 3. Fallback to category background if Imagen fails
 */
export async function generateScenes(
  config: SceneConfig
): Promise<SceneResult> {
  const sceneCount = config.sceneCount ?? DEFAULT_SCENE_COUNT;
  const imagenModel = config.imagenModel ?? DEFAULT_IMAGEN_MODEL;
  const aspectRatio = config.aspectRatio ?? DEFAULT_ASPECT_RATIO;
  const promptSuffix = config.promptSuffix ?? DEFAULT_PROMPT_SUFFIX;

  // Ensure output directory exists
  if (!existsSync(config.outputDir)) {
    mkdirSync(config.outputDir, { recursive: true });
  }

  const apiKey = getApiKey();

  // Step 1: Generate scene prompts via Gemini
  console.log("[Scenes] Generating scene prompts via Gemini...");
  const prompts = await generateScenePrompts(
    config.tipTitle,
    config.tipText,
    config.category,
    sceneCount,
    apiKey
  );
  console.log(`[Scenes] Got ${prompts.length} scene prompts`);

  // Step 2: Generate images via Imagen 4
  const imagePaths: string[] = [];
  let usedFallback = false;

  for (let i = 0; i < prompts.length; i++) {
    const fullPrompt = prompts[i] + promptSuffix;
    const outputPath = join(config.outputDir, `scene-${i + 1}.png`);

    console.log(
      `[Scenes] Generating scene ${i + 1}/${prompts.length}: ${prompts[i].slice(0, 60)}...`
    );

    const imageBuffer = await generateImageWithImagen(
      fullPrompt,
      imagenModel,
      aspectRatio,
      apiKey
    );

    if (imageBuffer) {
      writeFileSync(outputPath, imageBuffer);
      imagePaths.push(outputPath);
      console.log(`[Scenes] Scene ${i + 1} ✅`);
    } else {
      // Fallback to category background
      console.warn(
        `[Scenes] Scene ${i + 1} Imagen failed, trying fallback...`
      );
      usedFallback = true;

      if (
        config.backgroundsDir &&
        copyFallbackBackground(config.category, config.backgroundsDir, outputPath)
      ) {
        imagePaths.push(outputPath);
        console.log(`[Scenes] Scene ${i + 1} using fallback background ✅`);
      } else {
        throw new Error(
          `Scene ${i + 1} generation failed and no fallback background available`
        );
      }
    }

    // Rate limit: wait between requests (skip after last)
    if (i < prompts.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return {
    imagePaths,
    prompts,
    source: usedFallback ? "fallback" : "imagen",
  };
}
