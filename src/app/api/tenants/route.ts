import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import db from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import type { Tenant } from '@/lib/types';

async function auth() {
  const cookieStore = await cookies();
  const token = cookieStore.get('sp_token')?.value;
  if (!token) return null;
  return verifyToken(token);
}

/** GET /api/tenants — list all tenants */
export async function GET() {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tenants = db.prepare('SELECT * FROM tenants ORDER BY name').all() as Tenant[];
  return NextResponse.json({ data: tenants });
}

/** POST /api/tenants — create a tenant */
export async function POST(req: NextRequest) {
  const user = auth();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const { id, name, description } = body as { id?: string; name?: string; description?: string };

  // Validate id — lowercase slug
  if (!id || !/^[a-z0-9-]+$/.test(id)) {
    return NextResponse.json(
      { error: 'id is required and must be a lowercase slug (a-z, 0-9, hyphens)' },
      { status: 400 },
    );
  }

  if (!name || !name.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Check for conflict
  const existing = db.prepare('SELECT id FROM tenants WHERE id = ?').get(id);
  if (existing) {
    return NextResponse.json({ error: 'Tenant with this id already exists' }, { status: 409 });
  }

  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO tenants (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, name.trim(), description?.trim() || null, now, now);

  const tenant = db.prepare('SELECT * FROM tenants WHERE id = ?').get(id) as Tenant;
  return NextResponse.json({ data: tenant }, { status: 201 });
}
