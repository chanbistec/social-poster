import { execSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname, resolve } from "path";
import { randomUUID } from "crypto";

const PYTHON_SCRIPT = join(process.cwd(), "src", "lib", "pipeline", "social-image-render.py");

const DEFAULT_BRANDING_CONFIG = join(
  process.env.HOME || "/home/chanclaw",
  ".openclaw/workspace/area6-health-tips/branding/reel-assets/social-post-config.json"
);

export interface SocialImageConfig {
  backgroundPath: string; // AI-generated or category background image
  title: string;
  subtitle?: string;
  brandingConfig: string; // path to social-post-config.json or inline JSON string
  logoPath?: string; // override logo path
  outputDir: string; // directory to save output image
}

export interface SocialImageResult {
  imagePath: string;
  width: number;
  height: number;
}

/**
 * Resolve the branding config path.
 * Accepts either a file path or inline JSON string.
 * If inline JSON, writes to a temp file and returns the path.
 */
function resolveBrandingConfig(brandingConfig: string, tmpDir: string): string {
  // If it looks like a JSON object, write to temp file
  if (brandingConfig.trim().startsWith("{")) {
    const tmpPath = join(tmpDir, `branding-${randomUUID().slice(0, 8)}.json`);
    writeFileSync(tmpPath, brandingConfig, "utf-8");
    return tmpPath;
  }

  // It's a file path
  const resolved = resolve(brandingConfig);
  if (!existsSync(resolved)) {
    throw new Error(`Branding config not found: ${resolved}`);
  }
  return resolved;
}

/**
 * Render a branded square social post image.
 *
 * Uses a Python/Pillow helper script to composite:
 * - Background image (resized to 1080x1080)
 * - Dark overlay
 * - Title text (centered, white, bold, with shadow)
 * - Subtitle text (left-aligned)
 * - Orange accent line
 * - Circular logo
 * - Watermark text
 */
export async function renderSocialImage(
  config: SocialImageConfig
): Promise<SocialImageResult> {
  // Validate inputs
  if (!existsSync(config.backgroundPath)) {
    throw new Error(`Background image not found: ${config.backgroundPath}`);
  }

  if (!config.title || config.title.trim().length === 0) {
    throw new Error("Title is required for social image rendering");
  }

  // Ensure output directory exists
  mkdirSync(config.outputDir, { recursive: true });

  // Determine output filename
  const slug = config.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  const outputPath = join(config.outputDir, `social-${slug}-${randomUUID().slice(0, 6)}.jpg`);

  // Resolve branding config (file path or inline JSON)
  const brandingConfigPath = resolveBrandingConfig(
    config.brandingConfig || DEFAULT_BRANDING_CONFIG,
    config.outputDir
  );

  // Build command args
  const args: string[] = [
    "python3",
    PYTHON_SCRIPT,
    "--background",
    config.backgroundPath,
    "--config",
    brandingConfigPath,
    "--title",
    config.title,
    "--output",
    outputPath,
  ];

  if (config.subtitle) {
    args.push("--subtitle", config.subtitle);
  }

  if (config.logoPath) {
    args.push("--logo", config.logoPath);
  }

  // Execute Python render script
  try {
    const stdout = execSync(
      args.map((a) => (a.includes(" ") ? `"${a.replace(/"/g, '\\"')}"` : a)).join(" "),
      {
        encoding: "utf-8",
        timeout: 30_000,
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    // Parse JSON output from Python script
    const result = JSON.parse(stdout.trim());

    return {
      imagePath: result.imagePath || outputPath,
      width: result.width || 1080,
      height: result.height || 1080,
    };
  } catch (err: any) {
    const stderr = err.stderr?.toString() || "";
    const msg = err.message || "Unknown error";
    throw new Error(
      `Social image render failed: ${msg}${stderr ? `\nStderr: ${stderr}` : ""}`
    );
  }
}
