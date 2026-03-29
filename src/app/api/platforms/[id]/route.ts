import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { encrypt, decrypt } from '@/lib/crypto';
import type { Platform, PlatformType } from '@/lib/types';

const VALID_TYPES: PlatformType[] = ['youtube', 'instagram', 'facebook'];

async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sp_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

type RouteContext = { params: Promise<{ id: string }> };

/** GET /api/platforms/[id] — single platform */
export async function GET(req: NextRequest, ctx: RouteContext) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const platform = db.prepare('SELECT * FROM platforms WHERE id = ?').get(Number(id)) as Platform | undefined;
  if (!platform) return NextResponse.json({ error: 'Platform not found' }, { status: 404 });

  const showSecrets = req.nextUrl.searchParams.get('secrets') === 'true';

  let creds: Record<string, unknown> = {};
  try {
    creds = JSON.parse(decrypt(platform.credentials));
  } catch { /* */ }

  if (!showSecrets) {
    for (const key of Object.keys(creds)) {
      creds[key] = '****';
    }
  }

  return NextResponse.json({
    data: { ...platform, credentials: creds, config: platform.config ? JSON.parse(platform.config) : null },
  });
}

/** PUT /api/platforms/[id] — update credentials/config */
export async function PUT(req: NextRequest, ctx: RouteContext) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const existing = db.prepare('SELECT * FROM platforms WHERE id = ?').get(Number(id)) as Platform | undefined;
  if (!existing) return NextResponse.json({ error: 'Platform not found' }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const { type, credentials, config, enabled } = body as {
    type?: string;
    credentials?: Record<string, unknown>;
    config?: Record<string, unknown>;
    enabled?: boolean;
  };

  // Validate type if provided
  if (type !== undefined && !VALID_TYPES.includes(type as PlatformType)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  const updatedType = (type as PlatformType) || existing.type;
  const updatedCreds = credentials ? encrypt(JSON.stringify(credentials)) : existing.credentials;
  const updatedConfig = config !== undefined ? (config ? JSON.stringify(config) : null) : existing.config;
  const updatedEnabled = enabled !== undefined ? (enabled ? 1 : 0) : (existing.enabled ? 1 : 0);

  db.prepare(
    'UPDATE platforms SET type = ?, credentials = ?, config = ?, enabled = ? WHERE id = ?',
  ).run(updatedType, updatedCreds, updatedConfig, updatedEnabled, Number(id));

  const platform = db.prepare('SELECT * FROM platforms WHERE id = ?').get(Number(id)) as Platform;

  // Return masked
  let creds: Record<string, unknown> = {};
  try {
    creds = JSON.parse(decrypt(platform.credentials));
    for (const key of Object.keys(creds)) {
      creds[key] = '****';
    }
  } catch { /* */ }

  return NextResponse.json({
    data: { ...platform, credentials: creds, config: platform.config ? JSON.parse(platform.config) : null },
  });
}

/** DELETE /api/platforms/[id] — remove a platform */
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  const existing = db.prepare('SELECT id FROM platforms WHERE id = ?').get(Number(id));
  if (!existing) return NextResponse.json({ error: 'Platform not found' }, { status: 404 });

  db.prepare('DELETE FROM platforms WHERE id = ?').run(Number(id));

  return NextResponse.json({ data: { deleted: Number(id) } });
}
