import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/route-auth';
import db from '@/lib/db';
import type { PipelineRun } from '@/lib/types';

type PublishResultRow = {
  id: number;
  platform: string;
  status: string;
  external_url: string | null;
  error: string | null;
  published_at: string | null;
};

type Params = { params: Promise<{ id: string }> };

/** GET /api/pipeline-runs/:id — Get run status and results */
export async function GET(_request: NextRequest, { params }: Params) {
  const auth = await getAuth();
  if (!auth) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { id } = await params;
  const runId = Number(id);
  if (isNaN(runId)) {
    return NextResponse.json({ error: 'Invalid run ID' }, { status: 400 });
  }

  const run = db.prepare(`
    SELECT pr.*, pt.name as template_name, pt.type as template_type,
           pt.tenant_id, t.name as tenant_name
    FROM pipeline_runs pr
    LEFT JOIN pipeline_templates pt ON pr.template_id = pt.id
    LEFT JOIN tenants t ON pt.tenant_id = t.id
    WHERE pr.id = ?
  `).get(runId) as (PipelineRun & {
    template_name: string | null;
    template_type: string | null;
    tenant_id: string | null;
    tenant_name: string | null;
  }) | undefined;

  if (!run) {
    return NextResponse.json({ error: 'Pipeline run not found' }, { status: 404 });
  }

  const publishResults = run.post_id
    ? (db
        .prepare('SELECT * FROM publish_results WHERE post_id = ? ORDER BY id ASC')
        .all(run.post_id) as PublishResultRow[])
    : [];

  const postSummary = run.post_id
    ? ((db
        .prepare('SELECT approved_at, approved_by FROM posts WHERE id = ?')
        .get(run.post_id) as { approved_at: string | null; approved_by: string | null } | undefined) ?? null)
    : null;

  // Parse JSON fields for the response
  const parsed = {
    ...run,
    input_params: safeJson(run.input_params),
    step_results: safeJson(run.step_results),
    output_paths: safeJson(run.output_paths),
  };

  return NextResponse.json({ data: parsed, publish_results: publishResults, post_summary: postSummary });
}

function safeJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
