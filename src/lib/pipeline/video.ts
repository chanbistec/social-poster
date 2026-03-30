/**
 * Video render pipeline – TypeScript wrapper around video-render.py.
 *
 * Writes a config JSON to a temp file, invokes the Python script,
 * and returns the output MP4 path + duration.
 */
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VideoRenderConfig {
  /** Paths to content scene images (branded by the Python script). */
  scenes: string[];
  /** Narration audio details. */
  narration: { wavPath: string; duration: number };
  /** Branding assets (logo, watermark, intro/outro frames, font, colors). */
  branding: Record<string, unknown>;
  /** Timing settings (intro/outro duration, voice delay, scene distribution). */
  timing: Record<string, unknown>;
  /** Audio settings (BGM path, volumes, fade in/out). */
  audio: Record<string, unknown>;
  /** Ken Burns effect names per scene (cycles if fewer than scenes). */
  kenBurns?: string[];
  /** Tip title for text overlays. */
  tipTitle?: string;
  /** Tip text for text overlays. */
  tipText?: string;
  /** Directory to write the final MP4 into. */
  outputDir: string;
  /** Override ffmpeg binary path. Default: ~/.npm-global/bin/ffmpeg */
  ffmpegPath?: string;
  /** Frames per second. Default: 30 */
  fps?: number;
  /** Video width. Default: 1080 */
  width?: number;
  /** Video height. Default: 1920 */
  height?: number;
}

export interface VideoRenderResult {
  /** Absolute path to the rendered MP4 file. */
  videoPath: string;
  /** Total video duration in seconds. */
  duration: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Path to the Python render script (co-located). */
const PYTHON_SCRIPT = join(process.cwd(), "src", "lib", "pipeline", "video-render.py");

/** Default ffmpeg location. */
const DEFAULT_FFMPEG = join(
  process.env.HOME ?? "~",
  ".npm-global",
  "bin",
  "ffmpeg",
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render a branded reel/short video.
 *
 * 1. Writes the render config to a temp JSON file.
 * 2. Invokes `python3 video-render.py --config <tmp> --output <out>`.
 * 3. Parses the JSON result from stdout.
 */
export async function renderVideo(
  config: VideoRenderConfig,
): Promise<VideoRenderResult> {
  // Prepare output path
  const outputPath = join(config.outputDir, `reel_${Date.now()}.mp4`);

  // Build the config object the Python script expects
  const pyConfig = {
    scenes: config.scenes,
    narration: config.narration,
    branding: config.branding,
    timing: config.timing,
    audio: config.audio,
    kenBurns: config.kenBurns ?? ["zoom_in", "slow_pan", "zoom_out"],
    tipTitle: config.tipTitle ?? "Health Tip",
    tipText: config.tipText ?? "",
    ffmpegPath: config.ffmpegPath ?? DEFAULT_FFMPEG,
    fps: config.fps ?? 30,
    width: config.width ?? 1080,
    height: config.height ?? 1920,
  };

  // Write config to temp file
  const tmpDir = mkdtempSync(join(tmpdir(), "video-render-"));
  const configPath = join(tmpDir, "config.json");
  writeFileSync(configPath, JSON.stringify(pyConfig, null, 2));

  try {
    const stdout = execSync(
      `python3 "${PYTHON_SCRIPT}" --config "${configPath}" --output "${outputPath}"`,
      {
        encoding: "utf-8",
        timeout: 10 * 60 * 1000, // 10 minute timeout
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    // The Python script prints a JSON result to stdout
    const result = JSON.parse(stdout.trim());

    return {
      videoPath: result.videoPath ?? outputPath,
      duration: result.duration ?? 0,
    };
  } finally {
    // Clean up temp config
    try {
      unlinkSync(configPath);
    } catch {
      // ignore
    }
  }
}
