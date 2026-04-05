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
} from '@/lib/types';

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

type PipelineStepState = 'pending' | 'running' | 'completed' | 'failed';

type PipelineStepKey = 'narration' | 'scenes' | 'video' | 'socialImage' | 'finalize';

export interface PipelineStepResult {
  key: PipelineStepKey;
  label: string;
  description: string;
  state: PipelineStepState;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  summary?: string;
  result?: unknown;
}

const STEP_META: Record<PipelineStepKey, { label: string; description: string }> = {
  narration: {
    label: 'Narration',
    description: 'Generate voice-over audio for the script.',
  },
  scenes: {
    label: 'Scenes',
    description: 'Create or select the visuals for the run.',
  },
  video: {
    label: 'Video',
    description: 'Render the final video output.',
  },
  socialImage: {
    label: 'Social Image',
    description: 'Render the square social image output.',
  },
  finalize: {
    label: 'Finalize',
    description: 'Save outputs and prepare the run for review.',
  },
};

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

  return { ...base, ...templateBranding };
}

function updateRunStatus(
  runId: number,
  status: string,
  extra?: {
    step_results?: string;
    output_paths?: string;
    error?: string | null;
    completed_at?: string | null;
    started_at?: string | null;
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
  if (extra?.started_at !== undefined) {
    fields.push('started_at = ?');
    values.push(extra.started_at);
  }

  values.push(runId);
  db.prepare(`UPDATE pipeline_runs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
}

function getStepOrder(templateType: PipelineTemplate['type']): PipelineStepKey[] {
  switch (templateType) {
    case 'social_image':
      return ['scenes', 'socialImage', 'finalize'];
    case 'short':
    case 'reel':
      return ['narration', 'scenes', 'video', 'finalize'];
    default:
      return ['narration', 'scenes', 'video', 'finalize'];
  }
}

function createInitialStepResults(templateType: PipelineTemplate['type']) {
  const orderedKeys = getStepOrder(templateType);
  return Object.fromEntries(
    orderedKeys.map((key) => [
      key,
      {
        key,
        label: STEP_META[key].label,
        description: STEP_META[key].description,
        state: 'pending',
      } satisfies PipelineStepResult,
    ]),
  ) as Record<PipelineStepKey, PipelineStepResult>;
}

function persistStepResults(runId: number, stepResults: Record<string, unknown>) {
  updateRunStatus(runId, 'generating', {
    step_results: JSON.stringify(stepResults),
  });
}

function setStepRunning(runId: number, stepResults: Record<PipelineStepKey, PipelineStepResult>, key: PipelineStepKey) {
  stepResults[key] = {
    ...stepResults[key],
    state: 'running',
    startedAt: stepResults[key].startedAt ?? new Date().toISOString(),
    completedAt: undefined,
    error: undefined,
  };
  persistStepResults(runId, stepResults);
}

function setStepComplete(
  runId: number,
  stepResults: Record<PipelineStepKey, PipelineStepResult>,
  key: PipelineStepKey,
  result: unknown,
  summary?: string,
) {
  stepResults[key] = {
    ...stepResults[key],
    state: 'completed',
    completedAt: new Date().toISOString(),
    result,
    summary,
    error: undefined,
  };
  persistStepResults(runId, stepResults);
}

function setStepFailed(
  runId: number,
  stepResults: Record<PipelineStepKey, PipelineStepResult>,
  key: PipelineStepKey,
  error: string,
) {
  stepResults[key] = {
    ...stepResults[key],
    state: 'failed',
    completedAt: new Date().toISOString(),
    error,
  };
  persistStepResults(runId, stepResults);
}

function summarizeNarration(result: { duration: number }) {
  return `${result.duration.toFixed(1)}s voice-over ready`;
}

function summarizeScenes(result: { imagePaths?: string[]; source?: string }) {
  const count = result.imagePaths?.length ?? 0;
  const source = result.source === 'fallback' ? 'fallback art' : 'generated art';
  return `${count} ${count === 1 ? 'scene' : 'scenes'} prepared via ${source}`;
}

function summarizeVideo(result: { duration: number }) {
  return `${result.duration.toFixed(1)}s video rendered`;
}

function summarizeSocialImage(result: { width: number; height: number }) {
  return `${result.width}×${result.height} social image ready`;
}

export function createPipelineRun(templateId: number, input: RunInput): number {
  const template = db
    .prepare('SELECT id, type FROM pipeline_templates WHERE id = ?')
    .get(templateId) as Pick<PipelineTemplate, 'id' | 'type'> | undefined;

  if (!template) {
    throw new Error(`Pipeline template not found: ${templateId}`);
  }

  const now = new Date().toISOString();
  const stepResults = createInitialStepResults(template.type);
  const result = db
    .prepare(
      `INSERT INTO pipeline_runs (template_id, status, input_params, step_results, started_at, created_at)
       VALUES (?, 'generating', ?, ?, ?, ?)`,
    )
    .run(templateId, JSON.stringify(input), JSON.stringify(stepResults), now, now);

  return Number(result.lastInsertRowid);
}

export function startPipelineRunInBackground(runId: number) {
  setImmediate(() => {
    void continuePipelineRun(runId).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[Pipeline] Background run ${runId} crashed:`, error);
      updateRunStatus(runId, 'failed', {
        error: message,
        completed_at: new Date().toISOString(),
      });
    });
  });
}

export async function executePipeline(
  templateId: number,
  input: RunInput,
): Promise<RunResult> {
  const runId = createPipelineRun(templateId, input);
  return continuePipelineRun(runId);
}

export async function continuePipelineRun(runId: number): Promise<RunResult> {
  const run = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as {
    id: number;
    template_id: number;
    input_params: string;
    step_results: string | null;
  } | undefined;

  if (!run) {
    throw new Error(`Pipeline run not found: ${runId}`);
  }

  const template = db
    .prepare('SELECT * FROM pipeline_templates WHERE id = ?')
    .get(run.template_id) as PipelineTemplate | undefined;

  if (!template) {
    throw new Error(`Pipeline template not found: ${run.template_id}`);
  }

  const input = parseJson<RunInput>(run.input_params, {
    title: '',
    tip: '',
    category: '',
  });

  const ttsConfig = parseJson<TtsConfig | null>(template.tts_config, null);
  const imagenConfig = parseJson<ImagenConfig | null>(template.imagen_config, null);
  const videoConfig = parseJson<VideoConfig | null>(template.video_config, null);
  const templateBranding = parseJson<Record<string, unknown>>(template.branding, {});
  const tenantBranding = db
    .prepare('SELECT * FROM tenant_branding WHERE tenant_id = ?')
    .get(template.tenant_id) as TenantBranding | undefined;
  const branding = mergeBranding(tenantBranding, templateBranding);

  const stepResults = {
    ...createInitialStepResults(template.type),
    ...parseJson<Record<PipelineStepKey, PipelineStepResult> | null>(run.step_results, null),
  } as Record<PipelineStepKey, PipelineStepResult>;

  const outputDir = join(process.cwd(), 'data', 'pipeline-runs', String(runId));
  mkdirSync(outputDir, { recursive: true });

  const outputPaths: string[] = [];

  try {
    switch (template.type) {
      case 'reel': {
        setStepRunning(runId, stepResults, 'narration');
        const narration = await generateNarration({
          text: input.tip,
          model: ttsConfig?.voice ?? undefined,
          lengthScale: ttsConfig?.speed ?? undefined,
          outputDir,
        });
        setStepComplete(runId, stepResults, 'narration', narration, summarizeNarration(narration));

        setStepRunning(runId, stepResults, 'scenes');
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
        setStepComplete(runId, stepResults, 'scenes', scenes, summarizeScenes(scenes));

        const cwd = process.cwd();
        const resolvePath = (p: unknown) => {
          if (!p || typeof p !== 'string') return undefined;
          if (p.startsWith('/')) return p;
          return join(cwd, p);
        };

        const vcObj = (videoConfig as Record<string, unknown> | null) ?? {};
        const structure = (vcObj.structure ?? {}) as Record<string, unknown>;
        const introStruct = (structure.intro ?? {}) as Record<string, unknown>;
        const outroStruct = (structure.outro ?? {}) as Record<string, unknown>;
        const scenesStruct = (structure.scenes ?? {}) as Record<string, unknown>;
        const timingObj = (vcObj.timing ?? {}) as Record<string, unknown>;
        const audioObj = (vcObj.audio ?? {}) as Record<string, unknown>;

        const fontsObj = branding.fonts as Record<string, string> | undefined;
        const fontPath =
          fontsObj?.heading ?? fontsObj?.body ?? (branding as Record<string, unknown>).font as string | undefined;

        const videoBranding = {
          logoPath: resolvePath(branding.logo_path),
          logoSize: (branding as Record<string, unknown>).logo_size ?? 55,
          watermarkText: ((branding.watermark as Record<string, unknown>)?.text as string) ?? 'qualitylife.lk',
          fontPath: fontPath ?? undefined,
          introFrame: resolvePath(branding.intro_frame),
          outroFrame: resolvePath(branding.outro_frame),
        };

        const videoTiming = {
          introDuration: (introStruct.duration as number) ?? 2.0,
          outroDuration: (outroStruct.duration as number) ?? 3.0,
          voiceDelay: (timingObj.voice_delay as number) ?? 2.0,
          voiceBuffer: (timingObj.voice_buffer_after as number) ?? 0.5,
          sceneDistribution: (scenesStruct.distribution as number[]) ?? [0.3, 0.4, 0.3],
        };

        const videoAudio = {
          bgmPath: resolvePath(branding.bgm_path) ?? resolvePath(audioObj.bgm),
          bgmVolume: (audioObj.bgm_volume as number) ?? 0.2,
          voiceVolume: (audioObj.voice_volume as number) ?? 1.0,
          bgmFadeIn: (audioObj.bgm_fade_in as number) ?? 1.5,
          bgmFadeOut: (audioObj.bgm_fade_out as number) ?? 2.0,
        };

        const kenBurns = (scenesStruct.ken_burns_styles as string[]) ?? ['zoom_in', 'slow_pan', 'zoom_out'];

        setStepRunning(runId, stepResults, 'video');
        const video = await renderVideo({
          scenes: scenes.imagePaths,
          narration: { wavPath: narration.wavPath, duration: narration.duration },
          branding: videoBranding,
          timing: videoTiming,
          audio: videoAudio,
          kenBurns,
          tipTitle: input.title,
          tipText: input.tip,
          outputDir,
        });
        outputPaths.push(video.videoPath);
        setStepComplete(runId, stepResults, 'video', video, summarizeVideo(video));
        break;
      }

      case 'short': {
        setStepRunning(runId, stepResults, 'narration');
        const narration = await generateNarration({
          text: input.tip,
          model: ttsConfig?.voice ?? undefined,
          lengthScale: ttsConfig?.speed ?? undefined,
          outputDir,
        });
        setStepComplete(runId, stepResults, 'narration', narration, summarizeNarration(narration));

        setStepRunning(runId, stepResults, 'scenes');
        const backgroundsMap = parseJson<Record<string, string>>(tenantBranding?.backgrounds ?? '{}', {});
        const bgPath = backgroundsMap[input.category] ?? backgroundsMap.default ?? '';

        let scenesResult: { imagePaths: string[]; prompts: string[]; source: 'imagen' | 'fallback' } | undefined;
        const scenePaths: string[] = [];
        if (bgPath && existsSync(bgPath)) {
          scenePaths.push(bgPath);
          scenesResult = {
            imagePaths: [bgPath],
            prompts: [],
            source: 'fallback',
          };
        } else {
          const scenes = await generateScenes({
            tipText: input.tip,
            tipTitle: input.title,
            category: input.category,
            sceneCount: 1,
            aspectRatio: '9:16',
            outputDir,
          });
          scenePaths.push(...scenes.imagePaths);
          scenesResult = scenes;
        }
        setStepComplete(runId, stepResults, 'scenes', scenesResult, summarizeScenes(scenesResult));

        setStepRunning(runId, stepResults, 'video');
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
        outputPaths.push(video.videoPath);
        setStepComplete(runId, stepResults, 'video', video, summarizeVideo(video));
        break;
      }

      case 'social_image': {
        setStepRunning(runId, stepResults, 'scenes');
        const scenes = await generateScenes({
          tipText: input.tip,
          tipTitle: input.title,
          category: input.category,
          sceneCount: 1,
          aspectRatio: '1:1',
          outputDir,
        });
        setStepComplete(runId, stepResults, 'scenes', scenes, summarizeScenes(scenes));

        const brandingConfigStr = JSON.stringify({
          ...parseJson(tenantBranding?.colors ?? '{}', {}),
          ...parseJson(tenantBranding?.fonts ?? '{}', {}),
          logo_path: branding.logo_path,
          watermark: branding.watermark,
        });

        setStepRunning(runId, stepResults, 'socialImage');
        const image = await renderSocialImage({
          backgroundPath: scenes.imagePaths[0],
          title: input.title,
          subtitle: input.tip,
          brandingConfig: brandingConfigStr,
          logoPath: (branding.logo_path as string) ?? undefined,
          outputDir,
        });
        outputPaths.push(image.imagePath);
        setStepComplete(runId, stepResults, 'socialImage', image, summarizeSocialImage(image));
        break;
      }

      default:
        throw new Error(`Unsupported pipeline type: ${template.type}`);
    }

    setStepRunning(runId, stepResults, 'finalize');
    setStepComplete(runId, stepResults, 'finalize', { outputPaths }, `${outputPaths.length} output file${outputPaths.length === 1 ? '' : 's'} saved`);

    updateRunStatus(runId, 'preview', {
      step_results: JSON.stringify(stepResults),
      output_paths: JSON.stringify(outputPaths),
      error: null,
      completed_at: new Date().toISOString(),
    });

    return { runId, status: 'preview', outputPaths, stepResults };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Run ${runId} failed:`, errorMsg);

    const activeStep = (Object.keys(stepResults) as PipelineStepKey[]).find(
      (key) => stepResults[key]?.state === 'running',
    );
    if (activeStep) {
      setStepFailed(runId, stepResults, activeStep, errorMsg);
    }

    updateRunStatus(runId, 'failed', {
      step_results: JSON.stringify(stepResults),
      output_paths: JSON.stringify(outputPaths),
      error: errorMsg,
      completed_at: new Date().toISOString(),
    });

    return { runId, status: 'failed', outputPaths, stepResults };
  }
}
