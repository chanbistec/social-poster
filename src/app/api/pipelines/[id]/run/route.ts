import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/route-auth';
import { executePipeline, type RunInput } from '@/lib/pipeline/runner';
import db from '@/lib/db';

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

  // Verify template exists
  const template = db.prepare('SELECT id FROM pipeline_templates WHERE id = ?').get(templateId);
  if (!template) {
    return NextResponse.json({ error: 'Pipeline template not found' }, { status: 404 });
  }

  // Parse and validate body
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { title, tip, category, hashtags, highlight } = body;

  if (!title || typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 });
  }
  if (!tip || typeof tip !== 'string' || !tip.trim()) {
    return NextResponse.json({ error: 'tip is required' }, { status: 400 });
  }
  if (!category || typeof category !== 'string' || !category.trim()) {
    return NextResponse.json({ error: 'category is required' }, { status: 400 });
  }

  const input: RunInput = {
    title: title.trim(),
    tip: tip.trim(),
    category: category.trim(),
    hashtags: Array.isArray(hashtags) ? hashtags : undefined,
    highlight: typeof highlight === 'string' ? highlight.trim() || undefined : undefined,
  };

  const result = await executePipeline(templateId, input);

  return NextResponse.json({
    data: {
      run_id: result.runId,
      status: result.status,
      output_paths: result.outputPaths,
    },
  });
}
