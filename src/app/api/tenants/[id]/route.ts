import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { decrypt } from '@/lib/crypto';
import type { Tenant, Platform } from '@/lib/types';

async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sp_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/tenants/[id] — single tenant + its platforms */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as Tenant | undefined;
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const showSecrets = req.nextUrl.searchParams.get('secrets') === 'true';

  const platforms = (
    db.prepare('SELECT * FROM platforms WHERE tenant_id = ?').all(id) as Platform[]
  ).map((p) => {
    let creds: Record<string, unknown> = {};
    try {
      creds = JSON.parse(decrypt(p.credentials));
    } catch {
      /* corrupted creds — return empty */
    }

    if (!showSecrets) {
      // Mask all values
      for (const key of Object.keys(creds)) {
        creds[key] = '****';
      }
    }

    return { ...p, credentials: creds, config: p.config ? JSON.parse(p.config) : null };
  });

  return NextResponse.json({ data: { ...tenant, platforms } });
}

/** PUT /api/tenants/[id] — update tenant */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const existing = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as Tenant | undefined;
  if (!existing) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const { name, description } = body as { name?: string; description?: string };

  const updatedName = name?.trim() || existing.name;
  const updatedDesc = description !== undefined ? (description?.trim() || null) : existing.description;
  const now = new Date().toISOString();

  db.prepare('UPDATE tenants SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(
    updatedName,
    updatedDesc,
    now,
    id,
  );

  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as Tenant;
  return NextResponse.json({ data: tenant });
}

/** DELETE /api/tenants/[id] — delete tenant */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const existing = db.prepare('SELECT id FROM tenants WHERE id = ?').get(id);
  if (!existing) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

  // Delete related platforms first
  db.prepare('DELETE FROM platforms WHERE tenant_id = ?').run(id);
  db.prepare('DELETE FROM tenants WHERE id = ?').run(id);

  return NextResponse.json({ data: { deleted: id } });
}
