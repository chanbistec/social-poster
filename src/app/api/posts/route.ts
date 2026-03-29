import { NextRequest, NextResponse } from 'next/server';
import db from '@/lib/db';
import { getAuth } from '@/lib/route-auth';
import type { Post, PostStatus } from '@/lib/types';

// GET /api/posts — list posts with optional filters
export async function GET(request: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const tenantId = searchParams.get('tenant_id');
  const status = searchParams.get('status') as PostStatus | null;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  let query = 'SELECT * FROM posts WHERE 1=1';
  const params: unknown[] = [];

  if (tenantId) {
    query += ' AND tenant_id = ?';
    params.push(tenantId);
  }
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const posts = db.prepare(query).all(...params) as Post[];

  return NextResponse.json({ data: posts });
}

// POST /api/posts — create a new post
export async function POST(request: NextRequest) {
  const auth = await getAuth();
  if (!auth) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: {
    tenant_id: string;
    caption?: string;
    hashtags?: string[];
    media_paths?: string[];
    platforms?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tenant_id, caption, hashtags = [], media_paths = [], platforms = [] } = body;

  if (!tenant_id) {
    return NextResponse.json({ error: 'tenant_id is required' }, { status: 400 });
  }

  if (platforms.length === 0) {
    return NextResponse.json({ error: 'At least one platform is required' }, { status: 400 });
  }

  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO posts (tenant_id, status, caption, hashtags, media_paths, platforms, created_at, updated_at)
    VALUES (?, 'draft', ?, ?, ?, ?, ?, ?)
  `).run(
    tenant_id,
    caption ?? null,
    JSON.stringify(hashtags),
    JSON.stringify(media_paths),
    JSON.stringify(platforms),
    now,
    now,
  );

  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(result.lastInsertRowid) as Post;

  return NextResponse.json({ data: post }, { status: 201 });
}
