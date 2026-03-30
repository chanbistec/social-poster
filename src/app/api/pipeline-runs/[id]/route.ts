import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@/lib/route-auth';
import db from '@/lib/db';
import type { PipelineRun } from '@/lib/types';

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

  // Parse JSON fields for the response
  const parsed = {
    ...run,
    input_params: safeJson(run.input_params),
    step_results: safeJson(run.step_results),
    output_paths: safeJson(run.output_paths),
  };

  return NextResponse.json({ data: parsed });
}

function safeJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}
