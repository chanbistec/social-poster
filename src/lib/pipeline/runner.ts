import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { generateNarration } from './narration';
import { generateScenes } from './scenes';
import { renderVideo } from './video';
import { renderSocialImage } from './social-image';
import db from '@/lib/db';
import type {
  PipelineTemplate,
  TenantBranding,
  TtsConfig,
  ImagenConfig,
  VideoConfig,
  PlatformType,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface RunInput {
  title: string;
  tip: string;
  category: string;
  hashtags?: string[];
  highlight?: string;
}

export interface RunResult {
  runId: number;
  status: string;
  outputPaths: string[];
  stepResults: Record<string, unknown>;
  postId?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function mergeBranding(
  tenantBranding: TenantBranding | undefined,
  templateBranding: Record<string, unknown>,
): Record<string, unknown> {
  if (!tenantBranding) return templateBranding;

  const base: Record<string, unknown> = {
    logo_path: tenantBranding.logo_path,
    colors: parseJson(tenantBranding.colors, {}),
    fonts: parseJson(tenantBranding.fonts, {}),
    intro_frame: tenantBranding.intro_frame,
    outro_frame: tenantBranding.outro_frame,
    watermark: tenantBranding.watermark,
    bgm_path: tenantBranding.bgm_path,
    backgrounds: parseJson(tenantBranding.backgrounds, {}),
  };

  // Template branding overrides tenant defaults
  return { ...base, ...templateBranding };
}

function updateRunStatus(
  runId: number,
  status: string,
  extra?: {
    step_results?: string;
    output_paths?: string;
    error?: string;
    completed_at?: string;
  },
) {
  const fields = ['status = ?'];
  const values: unknown[] = [status];

  if (extra?.step_results !== undefined) {
    fields.push('step_results = ?');
    values.push(extra.step_results);
  }
  if (extra?.output_paths !== undefined) {
    fields.push('output_paths = ?');
    values.push(extra.output_paths);
  }
  if (extra?.error !== undefined) {
    fields.push('error = ?');
    values.push(extra.error);
  }
  if (extra?.completed_at !== undefined) {
    fields.push('completed_at = ?');
    values.push(extra.completed_at);
  }

  values.push(runId);
  db.prepare(`UPDATE pipeline_runs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

// ---------------------------------------------------------------------------
// Pipeline execution
// ---------------------------------------------------------------------------

export async function executePipeline(
  templateId: number,
  input: RunInput,
): Promise<RunResult> {
  // 1. Load template
  const template = db
    .prepare('SELECT * FROM pipeline_templates WHERE id = ?')
    .get(templateId) as PipelineTemplate | undefined;

  if (!template) {
    throw new Error(`Pipeline template not found: ${templateId}`);
  }

  // 2. Parse JSON config fields
  const ttsConfig = parseJson<TtsConfig | null>(template.tts_config, null);
  const imagenConfig = parseJson<ImagenConfig | null>(template.imagen_config, null);
  const videoConfig = parseJson<VideoConfig | null>(template.video_config, null);
  const templateBranding = parseJson<Record<string, unknown>>(template.branding, {});

  // Load tenant branding and merge
  const tenantBranding = db
    .prepare('SELECT * FROM tenant_branding WHERE tenant_id = ?')
    .get(template.tenant_id) as TenantBranding | undefined;
  const branding = mergeBranding(tenantBranding, templateBranding);

  // 3. Create pipeline_run row
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO pipeline_runs (template_id, status, input_params, started_at, created_at)
       VALUES (?, 'generating', ?, ?, ?)`,
    )
    .run(templateId, JSON.stringify(input), now, now);

  const runId = Number(result.lastInsertRowid);

  // 4. Create output directory
  const outputDir = join(process.cwd(), 'data', 'pipeline-runs', String(runId));
  mkdirSync(outputDir, { recursive: true });

  // 5. Execute steps based on template type
  const stepResults: Record<string, unknown> = {};
  const outputPaths: string[] = [];

  try {
    switch (template.type) {
      case 'reel': {
        // a. Narration
        const narration = await generateNarration({
          text: input.tip,
          model: ttsConfig?.voice ?? undefined,
          lengthScale: ttsConfig?.speed ?? undefined,
          outputDir,
        });
        stepResults.narration = narration;

        // b. Scenes (AI-generated)
        const scenes = await generateScenes({
          tipText: input.tip,
          tipTitle: input.title,
          category: input.category,
          outputDir,
          sceneCount: imagenConfig?.model ? undefined : undefined,
          imagenModel: imagenConfig?.model ?? undefined,
          aspectRatio: imagenConfig?.aspect_ratio ?? '9:16',
          backgroundsDir: (branding.backgrounds as Record<string, string>)?.dir ?? undefined,
        });
        stepResults.scenes = scenes;

        // c. Render video
        const video = await renderVideo({
          scenes: scenes.imagePaths,
          narration: { wavPath: narration.wavPath, duration: narration.duration },
          branding,
          timing: (videoConfig as Record<string, unknown>) ?? {},
          audio: {
            bgmPath: branding.bgm_path ?? undefined,
            ...(videoConfig?.duration ? { duration: videoConfig.duration } : {}),
          },
          outputDir,
        });
        stepResults.video = video;
        outputPaths.push(video.videoPath);
        break;
      }

      case 'short': {
        // a. Narration
        const narration = await generateNarration({
          text: input.tip,
          model: ttsConfig?.voice ?? undefined,
          lengthScale: ttsConfig?.speed ?? undefined,
          outputDir,
        });
        stepResults.narration = narration;

        // b. Use category background (no AI scene generation)
        const backgroundsMap = parseJson<Record<string, string>>(
          tenantBranding?.backgrounds ?? '{}',
          {},
        );
        const bgPath = backgroundsMap[input.category] ?? backgroundsMap['default'] ?? '';

        const scenePaths: string[] = [];
        if (bgPath && existsSync(bgPath)) {
          scenePaths.push(bgPath);
        } else {
          // Fallback: generate a single scene
          const scenes = await generateScenes({
            tipText: input.tip,
            tipTitle: input.title,
            category: input.category,
            sceneCount: 1,
            aspectRatio: '9:16',
            outputDir,
          });
          scenePaths.push(...scenes.imagePaths);
          stepResults.scenes = scenes;
        }

        // c. Render video with single scene
        const video = await renderVideo({
          scenes: scenePaths,
          narration: { wavPath: narration.wavPath, duration: narration.duration },
          branding,
          timing: (videoConfig as Record<string, unknown>) ?? {},
          audio: {
            bgmPath: branding.bgm_path ?? undefined,
          },
          outputDir,
        });
        stepResults.video = video;
        outputPaths.push(video.videoPath);
        break;
      }

      case 'social_image': {
        // a. Generate 1 scene with 1:1 aspect ratio
        const scenes = await generateScenes({
          tipText: input.tip,
          tipTitle: input.title,
          category: input.category,
          sceneCount: 1,
          aspectRatio: '1:1',
          outputDir,
        });
        stepResults.scenes = scenes;

        // b. Render social image
        const brandingConfigStr = JSON.stringify({
          ...parseJson(tenantBranding?.colors ?? '{}', {}),
          ...parseJson(tenantBranding?.fonts ?? '{}', {}),
          logo_path: branding.logo_path,
          watermark: branding.watermark,
        });

        const image = await renderSocialImage({
          backgroundPath: scenes.imagePaths[0],
          title: input.title,
          subtitle: input.tip,
          brandingConfig: brandingConfigStr,
          logoPath: (branding.logo_path as string) ?? undefined,
          outputDir,
        });
        stepResults.socialImage = image;
        outputPaths.push(image.imagePath);
        break;
      }

      default:
        throw new Error(`Unsupported pipeline type: ${template.type}`);
    }

    // 6. Update run as preview
    updateRunStatus(runId, 'preview', {
      step_results: JSON.stringify(stepResults),
      output_paths: JSON.stringify(outputPaths),
      completed_at: new Date().toISOString(),
    });

    return { runId, status: 'preview', outputPaths, stepResults };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Run ${runId} failed:`, errorMsg);

    updateRunStatus(runId, 'failed', {
      step_results: JSON.stringify(stepResults),
      error: errorMsg,
      completed_at: new Date().toISOString(),
    });

    return { runId, status: 'failed', outputPaths: [], stepResults };
  }
}
