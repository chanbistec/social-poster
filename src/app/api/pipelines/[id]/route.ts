import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import { verifyToken } from '@/lib/auth';

async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sp_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/pipelines/[id] — single template with tenant name and recent runs count */
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  const template = db.prepare(`
    SELECT pt.*, t.name as tenant_name
    FROM pipeline_templates pt
    LEFT JOIN tenants t ON pt.tenant_id = t.id
    WHERE pt.id = ?
  `).get(id) as Record<string, unknown> | undefined;

  if (!template) {
    return NextResponse.json({ error: 'Pipeline template not found' }, { status: 404 });
  }

  // Count runs in the last 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const runCount = db.prepare(`
    SELECT COUNT(*) as count FROM pipeline_runs
    WHERE template_id = ? AND created_at >= ?
  `).get(id, thirtyDaysAgo) as { count: number };

  return NextResponse.json({
    data: { ...template, recent_runs_count: runCount.count },
  });
}

/** PUT /api/pipelines/[id] — update template (partial) */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  const existing = db.prepare('SELECT * FROM pipeline_templates WHERE id = ?').get(id) as
    | Record<string, unknown>
    | undefined;
  if (!existing) {
    return NextResponse.json({ error: 'Pipeline template not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const VALID_TYPES = ['reel', 'short', 'social_image', 'custom'] as const;

  // Build update fields
  const updates: string[] = [];
  const values: unknown[] = [];

  const stringFields = ['name', 'description', 'tenant_id'] as const;
  for (const field of stringFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(typeof body[field] === 'string' ? body[field].trim() || null : body[field]);
    }
  }

  if (body.type !== undefined) {
    if (!VALID_TYPES.includes(body.type)) {
      return NextResponse.json(
        { error: `type must be one of: ${VALID_TYPES.join(', ')}` },
        { status: 400 },
      );
    }
    updates.push('type = ?');
    values.push(body.type);
  }

  const jsonFields = ['platforms', 'steps', 'branding', 'tts_config', 'imagen_config', 'video_config'] as const;
  for (const field of jsonFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(body[field] !== null ? JSON.stringify(body[field]) : null);
    }
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  updates.push('updated_at = ?');
  values.push(new Date().toISOString());
  values.push(id);

  db.prepare(`UPDATE pipeline_templates SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM pipeline_templates WHERE id = ?').get(id);
  return NextResponse.json({ data: updated });
}

/** DELETE /api/pipelines/[id] — delete template */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;

  const existing = db.prepare('SELECT id FROM pipeline_templates WHERE id = ?').get(id);
  if (!existing) {
    return NextResponse.json({ error: 'Pipeline template not found' }, { status: 404 });
  }

  // Cascade: delete related pipeline_runs first
  db.prepare('DELETE FROM pipeline_runs WHERE template_id = ?').run(id);
  db.prepare('DELETE FROM pipeline_templates WHERE id = ?').run(id);

  return NextResponse.json({ data: { deleted: id } });
}
