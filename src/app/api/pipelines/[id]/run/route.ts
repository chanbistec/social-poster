import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/route-auth';
import { createPipelineRun, startPipelineRunInBackground, type RunInput } from '@/lib/pipeline/runner';
import db from '@/lib/db';
import type { PipelineTemplate } from '@/lib/types';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

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

  const template = db.prepare('SELECT id, type FROM pipeline_templates WHERE id = ?').get(templateId) as Pick<PipelineTemplate, 'id' | 'type'> | undefined;
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
