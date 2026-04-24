import { NextRequest, NextResponse } from 'next/server';
import { stat } from 'node:fs/promises';
import { getAuth } from '@/lib/route-auth';
import { createPipelineRun, startPipelineRunInBackground, type RunInput } from '@/lib/pipeline/runner';
import db from '@/lib/db';
import { decrypt, encrypt } from '@/lib/crypto';
import { getMediaPath } from '@/lib/media';
import { ensureFreshToken } from '@/lib/token-refresh';
import type { PipelineTemplate, Platform } from '@/lib/types';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

type RunPayload = {
  title?: unknown;
  tip?: unknown;
  category?: unknown;
  hashtags?: unknown;
  highlight?: unknown;
  media_path?: unknown;
};

function getCustomStepConfig(template: Pick<PipelineTemplate, 'steps'>, type: string) {
  try {
    const steps = JSON.parse(template.steps ?? '[]') as Array<{ type?: string; config?: Record<string, unknown> }>;
    return steps.find((step) => step.type === type)?.config ?? {};
  } catch {
    return {};
  }
}

function validateRunPayload(body: RunPayload, templateType: string, index?: number) {
  const label = index == null ? 'Run payload' : `Run ${index + 1}`;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const tip = typeof body.tip === 'string' ? body.tip.trim() : '';
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  const mediaPath = typeof body.media_path === 'string' ? body.media_path.trim() : '';

  if (!title) {
    throw new Error(`${label}: title is required`);
  }
  if (!tip) {
    throw new Error(`${label}: tip is required`);
  }
  if (!category) {
    throw new Error(`${label}: category is required`);
  }
  if (templateType === 'custom' && !mediaPath) {
    throw new Error(`${label}: media_path is required for this pipeline`);
  }

  return {
    title,
    tip,
    category,
    hashtags: Array.isArray(body.hashtags) ? body.hashtags.filter((tag): tag is string => typeof tag === 'string') : undefined,
    highlight: typeof body.highlight === 'string' ? body.highlight.trim() || undefined : undefined,
    mediaPath: mediaPath || undefined,
  } satisfies RunInput;
}

async function validateCustomMedia(template: Pick<PipelineTemplate, 'id' | 'type' | 'tenant_id' | 'steps'>, input: RunInput, templateId: number) {
  if (template.type !== 'custom' || !input.mediaPath) {
    return;
  }

  let absoluteMediaPath: string;

  try {
    absoluteMediaPath = getMediaPath(input.mediaPath);
  } catch {
    throw new Error('Uploaded academy video path is invalid');
  }

  try {
    const mediaStats = await stat(absoluteMediaPath);
    if (!mediaStats.isFile()) {
      throw new Error('Uploaded academy video could not be found');
    }
  } catch {
    throw new Error('Uploaded academy video could not be found');
  }

  if (!/\.(mp4|mov|webm)$/i.test(absoluteMediaPath)) {
    throw new Error('Academy pipeline only supports MP4, MOV, or WebM videos');
  }

  const youtubePlatform = db
    .prepare(`SELECT * FROM platforms WHERE tenant_id = ? AND type = 'youtube' AND enabled = 1 LIMIT 1`)
    .get(template.tenant_id) as Platform | undefined;

  if (!youtubePlatform) {
    throw new Error('No enabled YouTube platform is connected for this academy tenant');
  }

  await ensureFreshToken(youtubePlatform, decrypt, encrypt);

  const uploadConfig = getCustomStepConfig(template, 'upload_video');
  const privacy = typeof uploadConfig.privacy === 'string' ? uploadConfig.privacy : 'unlisted';
  const vivaEnabled = Boolean(uploadConfig.viva_engage);

  console.log(
    `[Pipeline] Academy upload preflight passed for template ${templateId} (${input.title}) - privacy=${privacy}, viva=${vivaEnabled}`,
  );
}

/** POST /api/pipelines/:id/run - Start one or many pipeline runs */
export async function POST(request: NextRequest, { params }: Params) {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const templateId = Number(id);
  if (isNaN(templateId)) {
    return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
  }

  const template = db.prepare('SELECT id, type, tenant_id, steps FROM pipeline_templates WHERE id = ?').get(templateId) as Pick<PipelineTemplate, 'id' | 'type' | 'tenant_id' | 'steps'> | undefined;
  if (!template) {
    return NextResponse.json({ error: 'Pipeline template not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (template.type === 'custom' && Array.isArray(body.runs)) {
    return NextResponse.json({ error: 'Batch runs are only available for non-custom pipelines' }, { status: 400 });
  }

  let inputs: RunInput[];
  try {
    const rawRuns = Array.isArray(body.runs) ? body.runs : [body];
    if (!rawRuns.length) {
      return NextResponse.json({ error: 'At least one run is required' }, { status: 400 });
    }
    if (rawRuns.length > 12) {
      return NextResponse.json({ error: 'A maximum of 12 runs can be queued at once' }, { status: 400 });
    }

    inputs = rawRuns.map((item, index) => validateRunPayload(item as RunPayload, template.type, Array.isArray(body.runs) ? index : undefined));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid run payload';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (template.type === 'custom') {
    try {
      await validateCustomMedia(template, inputs[0], templateId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { error: `YouTube connection needs attention before this academy upload can start: ${message}` },
        { status: 400 },
      );
    }
  }

  const runIds = inputs.map((input) => {
    const runId = createPipelineRun(templateId, input);
    startPipelineRunInBackground(runId);
    return runId;
  });

  const newestRunId = runIds[runIds.length - 1];

  return NextResponse.json({
    data: {
      run_id: newestRunId,
      run_ids: runIds,
      queued_count: runIds.length,
      status: 'generating',
      output_paths: [],
    },
  });
}
