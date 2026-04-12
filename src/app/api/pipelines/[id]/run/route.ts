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

function getCustomStepConfig(template: Pick<PipelineTemplate, 'steps'>, type: string) {
  try {
    const steps = JSON.parse(template.steps ?? '[]') as Array<{ type?: string; config?: Record<string, unknown> }>;
    return steps.find((step) => step.type === type)?.config ?? {};
  } catch {
    return {};
  }
}

/** POST /api/pipelines/:id/run — Start a pipeline run */
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

  const { title, tip, category, hashtags, highlight, media_path } = body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!tip || typeof tip !== 'string' || !tip.trim()) {
    return NextResponse.json({ error: 'tip is required' }, { status: 400 });
  }
  if (!category || typeof category !== 'string' || !category.trim()) {
    return NextResponse.json({ error: 'category is required' }, { status: 400 });
  }
  if (template.type === 'custom' && (!media_path || typeof media_path !== 'string' || !media_path.trim())) {
    return NextResponse.json({ error: 'media_path is required for this pipeline' }, { status: 400 });
  }

  const input: RunInput = {
    title: title.trim(),
    tip: tip.trim(),
    category: category.trim(),
    hashtags: Array.isArray(hashtags) ? hashtags : undefined,
    highlight: typeof highlight === 'string' ? highlight.trim() || undefined : undefined,
    mediaPath: typeof media_path === 'string' ? media_path.trim() || undefined : undefined,
  };

  if (template.type === 'custom' && input.mediaPath) {
    let absoluteMediaPath: string;

    try {
      absoluteMediaPath = getMediaPath(input.mediaPath);
    } catch {
      return NextResponse.json({ error: 'Uploaded academy video path is invalid' }, { status: 400 });
    }

    try {
      const mediaStats = await stat(absoluteMediaPath);
      if (!mediaStats.isFile()) {
        return NextResponse.json({ error: 'Uploaded academy video could not be found' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'Uploaded academy video could not be found' }, { status: 400 });
    }

    if (!/\.(mp4|mov|webm)$/i.test(absoluteMediaPath)) {
      return NextResponse.json({ error: 'Academy pipeline only supports MP4, MOV, or WebM videos' }, { status: 400 });
    }

    const youtubePlatform = db
      .prepare(`SELECT * FROM platforms WHERE tenant_id = ? AND type = 'youtube' AND enabled = 1 LIMIT 1`)
      .get(template.tenant_id) as Platform | undefined;

    if (!youtubePlatform) {
      return NextResponse.json({ error: 'No enabled YouTube platform is connected for this academy tenant' }, { status: 400 });
    }

    try {
      await ensureFreshToken(youtubePlatform, decrypt, encrypt);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json(
        { error: `YouTube connection needs attention before this academy upload can start: ${message}` },
        { status: 400 },
      );
    }

    const uploadConfig = getCustomStepConfig(template, 'upload_video');
    const privacy = typeof uploadConfig.privacy === 'string' ? uploadConfig.privacy : 'unlisted';
    const vivaEnabled = Boolean(uploadConfig.viva_engage);

    console.log(
      `[Pipeline] Academy upload preflight passed for template ${templateId} (${input.title}) — privacy=${privacy}, viva=${vivaEnabled}`,
    );
  }

  const runId = createPipelineRun(templateId, input);
  startPipelineRunInBackground(runId);

  return NextResponse.json({
    data: {
      run_id: runId,
      status: 'generating',
      output_paths: [],
    },
  });
}
