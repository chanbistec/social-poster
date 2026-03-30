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

const VALID_TYPES = ['reel', 'short', 'social_image', 'custom'] as const;

/** GET /api/pipelines — list pipeline templates, optional ?tenant_id= filter */
export async function GET(req: NextRequest) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get('tenant_id');

  let query = `
    SELECT pt.*, t.name as tenant_name
    FROM pipeline_templates pt
    LEFT JOIN tenants t ON pt.tenant_id = t.id
  `;
  const params: string[] = [];

  if (tenantId) {
    query += ' WHERE pt.tenant_id = ?';
    params.push(tenantId);
  }

  query += ' ORDER BY pt.created_at DESC';

  const templates = db.prepare(query).all(...params);
  return NextResponse.json({ data: templates });
}

/** POST /api/pipelines — create a pipeline template */
export async function POST(req: NextRequest) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const {
    tenant_id,
    name,
    description,
    type,
    platforms,
    steps,
    branding,
    tts_config,
    imagen_config,
    video_config,
  } = body as {
    tenant_id?: string;
    name?: string;
    description?: string;
    type?: string;
    platforms?: unknown;
    steps?: unknown;
    branding?: unknown;
    tts_config?: unknown;
    imagen_config?: unknown;
    video_config?: unknown;
  };

  if (!tenant_id) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 });
  }

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  if (!type || !VALID_TYPES.includes(type as (typeof VALID_TYPES)[number])) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  // Verify tenant exists
  const tenant = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenant_id);
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO pipeline_templates (tenant_id, name, description, type, platforms, steps, branding, tts_config, imagen_config, video_config, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tenant_id,
    name.trim(),
    description?.trim() || null,
    type,
    JSON.stringify(platforms || []),
    JSON.stringify(steps || []),
    JSON.stringify(branding || {}),
    tts_config ? JSON.stringify(tts_config) : null,
    imagen_config ? JSON.stringify(imagen_config) : null,
    video_config ? JSON.stringify(video_config) : null,
    now,
    now,
  );

  const inserted = db.prepare('SELECT * FROM pipeline_templates WHERE id = ?').get(result.lastInsertRowid);
  return NextResponse.json({ data: inserted }, { status: 201 });
}
