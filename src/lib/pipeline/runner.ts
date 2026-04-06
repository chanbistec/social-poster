import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { generateNarration } from './narration';
import { generateScenes } from './scenes';
import { renderVideo } from './video';
import { renderSocialImage } from './social-image';
import db from '@/lib/db';
import { decrypt, encrypt } from '@/lib/crypto';
import { getMediaPath } from '@/lib/media';
import { ensureFreshToken } from '@/lib/token-refresh';
import {
  ensurePlaylistAndAddVideo,
  publishToYouTube,
  type YouTubeCredentials,
} from '@/lib/publishers';
import type {
  PipelineTemplate,
  PlatformType,
  TenantBranding,
  TtsConfig,
  ImagenConfig,
  VideoConfig,
  Platform,
  VideoSafeZonesConfig,
} from '@/lib/types';
import { DEFAULT_VIDEO_SAFE_ZONES as VIDEO_SAFE_ZONE_DEFAULTS } from '@/lib/types';

export interface RunInput {
  title: string;
  tip: string;
  category: string;
  hashtags?: string[];
  highlight?: string;
  mediaPath?: string;
}

export interface RunResult {
  runId: number;
  status: string;
  outputPaths: string[];
  stepResults: Record<string, unknown>;
  postId?: number;
}

type PipelineStepState = 'pending' | 'running' | 'completed' | 'failed';
type PipelineStepKey = string;

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

const STEP_META: Record<string, { label: string; description: string }> = {
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
  uploadVideo: {
    label: 'Upload Video',
    description: 'Upload the academy video to YouTube.',
  },
  playlistAdd: {
    label: 'Playlist',
    description: 'Create or update the destination YouTube playlist.',
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

function titleCase(value: string) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/^./, (char) => char.toUpperCase())
    .trim();
}

function getStepMeta(key: string) {
  return STEP_META[key] ?? {
    label: titleCase(key),
    description: `Run ${titleCase(key).toLowerCase()} step.`,
  };
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

function resolveAssetPath(p: unknown) {
  if (!p || typeof p !== 'string') return undefined;
  if (p.startsWith('/')) return p;
  return join(process.cwd(), p);
}

function buildVideoRendererBranding(
  branding: Record<string, unknown>,
  videoConfig: VideoConfig | null,
  platforms: PlatformType[],
) {
  const fontsObj = branding.fonts as Record<string, string> | undefined;
  const fontPath =
    fontsObj?.heading ?? fontsObj?.body ?? (branding as Record<string, unknown>).font as string | undefined;
  const safeZones = ((videoConfig?.safe_zones ?? {}) as VideoSafeZonesConfig) || {};

  return {
    logoPath: resolveAssetPath(branding.logo_path),
    logoSize: Number((branding as Record<string, unknown>).logo_size ?? 55),
    watermarkText:
      typeof branding.watermark === 'string'
        ? branding.watermark
        : (((branding.watermark as Record<string, unknown> | null)?.text as string | undefined) ?? 'qualitylife.lk'),
    fontPath: fontPath ? resolveAssetPath(fontPath) : undefined,
    introFrame: resolveAssetPath(branding.intro_frame),
    outroFrame: resolveAssetPath(branding.outro_frame),
    safeZones: Object.fromEntries(
      (Object.keys(VIDEO_SAFE_ZONE_DEFAULTS) as PlatformType[]).map((platform) => [
        platform,
        {
          ...VIDEO_SAFE_ZONE_DEFAULTS[platform],
          ...(safeZones[platform] ?? {}),
          safe_zone: {
            ...VIDEO_SAFE_ZONE_DEFAULTS[platform].safe_zone,
            ...(safeZones[platform]?.safe_zone ?? {}),
          },
          overlays: {
            logo: {
              ...VIDEO_SAFE_ZONE_DEFAULTS[platform].overlays.logo,
              ...(safeZones[platform]?.overlays?.logo ?? {}),
            },
            watermark: {
              ...VIDEO_SAFE_ZONE_DEFAULTS[platform].overlays.watermark,
              ...(safeZones[platform]?.overlays?.watermark ?? {}),
            },
          },
        },
      ]),
    ),
    targetPlatforms: platforms,
  };
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
    post_id?: number | null;
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
  if (extra?.post_id !== undefined) {
    fields.push('post_id = ?');
    values.push(extra.post_id);
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
    case 'custom':
      return ['uploadVideo', 'playlistAdd', 'finalize'];
    default:
      return ['narration', 'scenes', 'video', 'finalize'];
  }
}

function createInitialStepResults(templateType: PipelineTemplate['type']) {
  const orderedKeys = getStepOrder(templateType);
  return Object.fromEntries(
    orderedKeys.map((key) => {
      const meta = getStepMeta(key);
      return [
        key,
        {
          key,
          label: meta.label,
          description: meta.description,
          state: 'pending',
        } satisfies PipelineStepResult,
      ];
    }),
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
    startedAt: stepResults[key]?.startedAt ?? new Date().toISOString(),
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

function buildCaption(input: RunInput) {
  const parts = [input.title.trim(), input.tip.trim()];
  if (input.hashtags?.length) {
    parts.push(input.hashtags.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)).join(' '));
  }
  return parts.filter(Boolean).join('\n\n').trim();
}

function createApprovedPost(template: PipelineTemplate, input: RunInput, outputPaths: string[]) {
  const now = new Date().toISOString();
  const caption = buildCaption(input);
  const platforms = parseJson<string[]>(template.platforms, []);

  const result = db.prepare(`
    INSERT INTO posts (tenant_id, status, caption, hashtags, media_paths, platforms, approved_at, approved_by, created_at, updated_at)
    VALUES (?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    template.tenant_id,
    caption,
    JSON.stringify(input.hashtags ?? []),
    JSON.stringify(outputPaths),
    JSON.stringify(platforms),
    now,
    'pipeline',
    now,
    now,
  );

  return Number(result.lastInsertRowid);
}

function getYouTubePlatform(template: PipelineTemplate) {
  const platform = db
    .prepare(`SELECT * FROM platforms WHERE tenant_id = ? AND type = 'youtube' AND enabled = 1 LIMIT 1`)
    .get(template.tenant_id) as Platform | undefined;

  if (!platform) {
    throw new Error(`No enabled YouTube platform found for tenant ${template.tenant_id}`);
  }

  return platform;
}

function getCustomStepConfig(template: PipelineTemplate, type: string) {
  const steps = parseJson<Array<{ type?: string; config?: Record<string, unknown> }>>(template.steps, []);
  return steps.find((step) => step.type === type)?.config ?? {};
}

function createPublishResult(
  postId: number,
  platform: string,
  status: 'success' | 'failed',
  extra?: {
    externalId?: string | null;
    externalUrl?: string | null;
    error?: string | null;
    publishedAt?: string | null;
  },
) {
  db.prepare(`
    INSERT INTO publish_results (post_id, platform, status, external_id, external_url, error, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    postId,
    platform,
    status,
    extra?.externalId ?? null,
    extra?.externalUrl ?? null,
    extra?.error ?? null,
    extra?.publishedAt ?? null,
  );
}

function getFailurePlatformForStep(stepKey?: string) {
  switch (stepKey) {
    case 'playlistAdd':
      return 'youtube_playlist';
    case 'uploadVideo':
      return 'youtube';
    default:
      return 'pipeline';
  }
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
  const targetPlatforms = parseJson<PlatformType[]>(template.platforms, []);
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
  let postId: number | undefined;

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

        const vcObj = (videoConfig as Record<string, unknown> | null) ?? {};
        const structure = (vcObj.structure ?? {}) as Record<string, unknown>;
        const introStruct = (structure.intro ?? {}) as Record<string, unknown>;
        const outroStruct = (structure.outro ?? {}) as Record<string, unknown>;
        const scenesStruct = (structure.scenes ?? {}) as Record<string, unknown>;
        const timingObj = (vcObj.timing ?? {}) as Record<string, unknown>;
        const audioObj = (vcObj.audio ?? {}) as Record<string, unknown>;

        const videoBranding = buildVideoRendererBranding(branding, videoConfig, targetPlatforms);

        const videoTiming = {
          introDuration: (introStruct.duration as number) ?? ((vcObj.intro_duration as number) ?? 2.0),
          outroDuration: (outroStruct.duration as number) ?? ((vcObj.outro_duration as number) ?? 3.0),
          voiceDelay: (timingObj.voice_delay as number) ?? ((vcObj.voice_delay as number) ?? 2.0),
          voiceBuffer: (timingObj.voice_buffer_after as number) ?? 0.5,
          sceneDistribution: (scenesStruct.distribution as number[]) ?? [0.3, 0.4, 0.3],
        };

        const videoAudio = {
          bgmPath: resolveAssetPath(branding.bgm_path) ?? resolveAssetPath(audioObj.bgm),
          bgmVolume: (audioObj.bgm_volume as number) ?? ((vcObj.bgm_volume as number) ?? 0.2),
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

        const videoBranding = buildVideoRendererBranding(branding, videoConfig, targetPlatforms);
        const shortVideoConfig = (videoConfig as Record<string, unknown> | null) ?? {};

        setStepRunning(runId, stepResults, 'video');
        const video = await renderVideo({
          scenes: scenePaths,
          narration: { wavPath: narration.wavPath, duration: narration.duration },
          branding: videoBranding,
          timing: {
            introDuration: (shortVideoConfig.intro_duration as number) ?? 2.0,
            outroDuration: (shortVideoConfig.outro_duration as number) ?? 3.0,
            voiceDelay: (shortVideoConfig.voice_delay as number) ?? 2.0,
          },
          audio: {
            bgmPath: resolveAssetPath(branding.bgm_path) ?? undefined,
            bgmVolume: (shortVideoConfig.bgm_volume as number) ?? 0.2,
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

      case 'custom': {
        if (!input.mediaPath) {
          throw new Error('A media upload is required for this custom pipeline');
        }

        const absoluteMediaPath = getMediaPath(input.mediaPath);
        outputPaths.push(absoluteMediaPath);

        const uploadConfig = getCustomStepConfig(template, 'upload_video');
        const playlistConfig = getCustomStepConfig(template, 'playlist_add');
        const privacy = (uploadConfig.privacy as 'public' | 'private' | 'unlisted' | undefined) ?? 'unlisted';
        const categoryId = typeof uploadConfig.category === 'string' ? uploadConfig.category : undefined;

        const platform = getYouTubePlatform(template);
        const freshCredentials = await ensureFreshToken(platform, decrypt, encrypt);
        const credentials = freshCredentials as YouTubeCredentials;

        postId = createApprovedPost(template, input, outputPaths);
        updateRunStatus(runId, 'publishing', {
          post_id: postId,
          output_paths: JSON.stringify(outputPaths),
          step_results: JSON.stringify(stepResults),
          error: null,
        });
        db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE id = ?').run('publishing', new Date().toISOString(), postId);

        setStepRunning(runId, stepResults, 'uploadVideo');
        const youtubeResult = await publishToYouTube(
          credentials,
          absoluteMediaPath,
          buildCaption(input),
          input.hashtags ?? [],
          privacy,
          {
            category: categoryId,
            title: input.title,
          },
        );

        if (!youtubeResult.success || !youtubeResult.external_id) {
          throw new Error(youtubeResult.error || 'YouTube upload failed');
        }

        createPublishResult(postId, 'youtube', 'success', {
          externalId: youtubeResult.external_id,
          externalUrl: youtubeResult.external_url ?? null,
          publishedAt: new Date().toISOString(),
        });
        setStepComplete(runId, stepResults, 'uploadVideo', youtubeResult, 'Video uploaded to YouTube');

        if (input.category?.trim()) {
          setStepRunning(runId, stepResults, 'playlistAdd');
          const playlistResult = await ensurePlaylistAndAddVideo(
            credentials,
            input.category,
            youtubeResult.external_id,
            (playlistConfig.privacy as 'public' | 'private' | 'unlisted' | undefined) ?? privacy,
          );
          createPublishResult(postId, 'youtube_playlist', 'success', {
            externalId: playlistResult.playlistId,
            externalUrl: playlistResult.playlistUrl,
            publishedAt: new Date().toISOString(),
          });
          setStepComplete(
            runId,
            stepResults,
            'playlistAdd',
            playlistResult,
            `Added to playlist ${input.category.trim()}`,
          );
        }

        db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE id = ?').run('published', new Date().toISOString(), postId);
        updateRunStatus(runId, 'published', {
          post_id: postId,
          step_results: JSON.stringify(stepResults),
          output_paths: JSON.stringify(outputPaths),
          error: null,
          completed_at: new Date().toISOString(),
        });

        return {
          runId,
          status: 'published',
          outputPaths,
          stepResults,
          postId,
        };
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
      post_id: postId ?? null,
    });

    return { runId, status: 'preview', outputPaths, stepResults, postId };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[Pipeline] Run ${runId} failed:`, errorMsg);

    const activeStep = Object.keys(stepResults).find(
      (key) => stepResults[key]?.state === 'running',
    );
    if (activeStep) {
      setStepFailed(runId, stepResults, activeStep, errorMsg);
    }

    if (postId) {
      db.prepare('UPDATE posts SET status = ?, updated_at = ? WHERE id = ?').run('failed', new Date().toISOString(), postId);
      createPublishResult(postId, getFailurePlatformForStep(activeStep), 'failed', {
        error: errorMsg,
      });
    }

    updateRunStatus(runId, 'failed', {
      step_results: JSON.stringify(stepResults),
      output_paths: JSON.stringify(outputPaths),
      error: errorMsg,
      completed_at: new Date().toISOString(),
      post_id: postId ?? null,
    });

    return { runId, status: 'failed', outputPaths, stepResults, postId };
  }
}
