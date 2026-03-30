import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/route-auth';
import db from '@/lib/db';
import type { PipelineRun, PipelineTemplate, PlatformType } from '@/lib/types';

type Params = { params: Promise<{ id: string }> };

/** POST /api/pipeline-runs/:id/approve — Approve generated content and create a post */
export async function POST(_request: NextRequest, { params }: Params) {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const runId = Number(id);
  if (isNaN(runId)) {
    return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 });
  }

  const run = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as PipelineRun | undefined;
  if (!run) {
    return NextResponse.json({ error: 'Pipeline run not found' }, { status: 404 });
  }

  if (run.status !== 'preview') {
    return NextResponse.json(
      { error: `Cannot approve run with status "${run.status}". Only runs in "preview" status can be approved.` },
      { status: 400 },
    );
  }

  // Load template for tenant_id and platforms
  const template = db.prepare('SELECT * FROM pipeline_templates WHERE id = ?').get(run.template_id) as PipelineTemplate | undefined;
  if (!template) {
    return NextResponse.json({ error: 'Associated pipeline template not found' }, { status: 404 });
  }

  // Parse input and output data
  let inputParams: { title?: string; tip?: string; hashtags?: string[] } = {};
  try {
    inputParams = JSON.parse(run.input_params);
  } catch { /* ignore */ }

  const outputPaths: string[] = run.output_paths ? JSON.parse(run.output_paths) : [];
  const platforms: PlatformType[] = template.platforms ? JSON.parse(template.platforms) : [];

  // Build caption from input
  const captionParts: string[] = [];
  if (inputParams.title) captionParts.push(inputParams.title);
  if (inputParams.tip) captionParts.push(inputParams.tip);
  if (inputParams.hashtags?.length) {
    captionParts.push(inputParams.hashtags.map((h) => (h.startsWith('#') ? h : `#${h}`)).join(' '));
  }
  const caption = captionParts.join('\n\n');

  const now = new Date().toISOString();

  // Use a transaction: create post + update run atomically
  const transaction = db.transaction(() => {
    // Create the post
    const postResult = db.prepare(`
      INSERT INTO posts (tenant_id, status, caption, hashtags, media_paths, platforms, approved_at, approved_by, created_at, updated_at)
      VALUES (?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      template.tenant_id,
      caption,
      JSON.stringify(inputParams.hashtags ?? []),
      JSON.stringify(outputPaths),
      JSON.stringify(platforms),
      now,
      auth.username,
      now,
      now,
    );

    const postId = Number(postResult.lastInsertRowid);

    // Update run status and link to post
    db.prepare(`
      UPDATE pipeline_runs SET status = 'approved', post_id = ? WHERE id = ?
    `).run(postId, runId);

    return postId;
  });

  const postId = transaction();

  // Fetch updated records
  const updatedRun = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId);
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);

  return NextResponse.json({
    data: {
      run: updatedRun,
      post,
    },
  });
}
