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

/** GET /api/platforms — list platforms, optional ?tenant_id filter */
export async function GET(req: NextRequest) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenantId = req.nextUrl.searchParams.get('tenant_id');
  const showSecrets = req.nextUrl.searchParams.get('secrets') === 'true';

  let rows: Platform[];
  if (tenantId) {
    rows = db.prepare('SELECT * FROM platforms WHERE tenant_id = ?').all(tenantId) as Platform[];
  } else {
    rows = db.prepare('SELECT * FROM platforms').all() as Platform[];
  }

  const platforms = rows.map((p) => {
    let creds: Record<string, unknown> = {};
    try {
      creds = JSON.parse(decrypt(p.credentials));
    } catch {
      /* corrupted */
    }
    if (!showSecrets) {
      for (const key of Object.keys(creds)) {
        creds[key] = '****';
      }
    }
    return { ...p, credentials: creds, config: p.config ? JSON.parse(p.config) : null };
  });

  return NextResponse.json({ data: platforms });
}

/** POST /api/platforms — add a platform to a tenant */
export async function POST(req: NextRequest) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const { tenant_id, type, credentials, config } = body as {
    tenant_id?: string;
    type?: string;
    credentials?: Record<string, unknown>;
    config?: Record<string, unknown>;
  };

  if (!tenant_id) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 });
  }

  // Check tenant exists
  const tenant = db.prepare('SELECT id FROM tenants WHERE id = ?').get(tenant_id);
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
  }

  if (!type || !VALID_TYPES.includes(type as PlatformType)) {
    return NextResponse.json(
      { error: `type must be one of: ${VALID_TYPES.join(', ')}` },
      { status: 400 },
    );
  }

  if (!credentials || typeof credentials !== 'object') {
    return NextResponse.json({ error: 'credentials object is required' }, { status: 400 });
  }

  const encryptedCreds = encrypt(JSON.stringify(credentials));
  const configJson = config ? JSON.stringify(config) : null;

  const result = db
    .prepare(
      'INSERT INTO platforms (tenant_id, type, credentials, config, enabled) VALUES (?, ?, ?, ?, 1)',
    )
    .run(tenant_id, type, encryptedCreds, configJson);

  const platform = db.prepare('SELECT * FROM platforms WHERE id = ?').get(result.lastInsertRowid) as Platform;

  // Return with masked credentials
  let creds: Record<string, unknown> = {};
  try {
    creds = JSON.parse(decrypt(platform.credentials));
    for (const key of Object.keys(creds)) {
      creds[key] = '****';
    }
  } catch { /* */ }

  return NextResponse.json(
    { data: { ...platform, credentials: creds, config: config || null } },
    { status: 201 },
  );
}
