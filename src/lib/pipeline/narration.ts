import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const DEFAULT_PIPER_BIN =
  "/home/chanclaw/.local/bin/piper";
const DEFAULT_MODEL =
  "/home/chanclaw/.openclaw/workspace/area6-health-tips/piper/en_US-lessac-medium.onnx";
const DEFAULT_LENGTH_SCALE = 1.15;

export interface NarrationConfig {
  text: string;
  model?: string; // path to .onnx model
  lengthScale?: number; // default 1.15 (slower = calmer)
  outputDir: string; // where to save the WAV
}

export interface NarrationResult {
  wavPath: string;
  duration: number; // seconds
}

/**
 * Parse a WAV file header to compute audio duration in seconds.
 * Standard RIFF/WAV: bytes 22-23 = numChannels, 24-27 = sampleRate,
 * 34-35 = bitsPerSample. We locate the "data" sub-chunk to get dataSize.
 */
function getWavDuration(wavPath: string): number {
  const buf = readFileSync(wavPath);

  if (buf.length < 44) {
    throw new Error(`WAV file too small: ${wavPath}`);
  }

  const riff = buf.toString("ascii", 0, 4);
  if (riff !== "RIFF") {
    throw new Error(`Not a valid WAV file (missing RIFF header): ${wavPath}`);
  }

  const numChannels = buf.readUInt16LE(22);
  const sampleRate = buf.readUInt32LE(24);
  const bitsPerSample = buf.readUInt16LE(34);

  if (sampleRate === 0 || numChannels === 0 || bitsPerSample === 0) {
    throw new Error(`Invalid WAV header values in ${wavPath}`);
  }

  // Find the "data" sub-chunk
  let offset = 12; // skip RIFF header (12 bytes)
  let dataSize = 0;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize;
  }

  if (dataSize === 0) {
    // Fallback: estimate from file size minus 44-byte header
    dataSize = buf.length - 44;
  }

  const bytesPerSecond = sampleRate * numChannels * (bitsPerSample / 8);
  return dataSize / bytesPerSecond;
}

/**
 * Generate TTS narration audio using Piper.
 */
export async function generateNarration(
  config: NarrationConfig
): Promise<NarrationResult> {
  const model = config.model || DEFAULT_MODEL;
  const lengthScale = config.lengthScale ?? DEFAULT_LENGTH_SCALE;
  const piperBin = DEFAULT_PIPER_BIN;

  // Validate piper binary exists
  if (!existsSync(piperBin)) {
    throw new Error(`Piper binary not found at: ${piperBin}`);
  }

  // Validate model exists
  if (!existsSync(model)) {
    throw new Error(`Piper model not found at: ${model}`);
  }

  // Ensure output directory exists
  mkdirSync(config.outputDir, { recursive: true });

  // Generate output filename
  const timestamp = Date.now();
  const wavPath = join(config.outputDir, `narration-${timestamp}.wav`);

  // Sanitize text for shell: escape single quotes
  const sanitized = config.text.replace(/'/g, "'\\''");

  const cmd = `echo '${sanitized}' | ${JSON.stringify(piperBin)} --model ${JSON.stringify(model)} --length-scale ${lengthScale} --output_file ${JSON.stringify(wavPath)}`;

  try {
    execSync(cmd, {
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 120_000, // 2 min timeout
    });
  } catch (err: any) {
    const stderr = err.stderr?.toString() || "";
    throw new Error(
      `Piper TTS generation failed: ${err.message}${stderr ? `\nstderr: ${stderr}` : ""}`
    );
  }

  // Verify output file was created
  if (!existsSync(wavPath)) {
    throw new Error(`Piper did not produce output file: ${wavPath}`);
  }

  const duration = getWavDuration(wavPath);

  return { wavPath, duration };
}
